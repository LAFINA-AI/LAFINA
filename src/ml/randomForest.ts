export type Label = 0 | 1;

export interface RandomForestOptions {
  trees: number;
  maxDepth: number;
  minLeaf: number;
  /** Fixed so the same history always gives the same model. */
  seed: number;
}

type TreeNode =
  | {leaf: true; probability: number}
  | {leaf: false; feature: number; threshold: number; left: TreeNode; right: TreeNode};

export interface RandomForest {
  trees: TreeNode[];
  sampleSize: number;
  /** Accuracy on samples each tree did not train on. Null if no sample was left out. */
  oobAccuracy: number | null;
}

/** Small deterministic generator (mulberry32). */
const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const gini = (positives: number, total: number): number => {
  if (total === 0) return 0;
  const share = positives / total;
  return 2 * share * (1 - share);
};

const chooseFeatures = (count: number, take: number, random: () => number): number[] => {
  const pool = Array.from({length: count}, (_, index) => index);
  for (let index = 0; index < take; index += 1) {
    const swap = index + Math.floor(random() * (count - index));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, take);
};

interface Split {
  feature: number;
  threshold: number;
  impurity: number;
}

const bestSplit = (
  X: readonly number[][],
  y: readonly Label[],
  samples: readonly number[],
  features: readonly number[],
  minLeaf: number,
): Split | null => {
  const totalPositives = samples.reduce((sum, sample) => sum + y[sample], 0);
  let best: Split | null = null;
  for (const feature of features) {
    const sorted = [...samples].sort((a, b) => X[a][feature] - X[b][feature]);
    let leftPositives = 0;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      leftPositives += y[sorted[index]];
      const leftValue = X[sorted[index]][feature];
      const rightValue = X[sorted[index + 1]][feature];
      const leftCount = index + 1;
      const rightCount = sorted.length - leftCount;
      if (leftValue === rightValue || leftCount < minLeaf || rightCount < minLeaf) continue;
      const impurity =
        (leftCount * gini(leftPositives, leftCount) +
          rightCount * gini(totalPositives - leftPositives, rightCount)) /
        sorted.length;
      if (!best || impurity < best.impurity) {
        best = {feature, threshold: (leftValue + rightValue) / 2, impurity};
      }
    }
  }
  return best;
};

const buildTree = (
  X: readonly number[][],
  y: readonly Label[],
  samples: readonly number[],
  depth: number,
  options: RandomForestOptions,
  random: () => number,
): TreeNode => {
  const positives = samples.reduce((sum, sample) => sum + y[sample], 0);
  const probability = samples.length === 0 ? 0 : positives / samples.length;
  if (depth >= options.maxDepth || positives === 0 || positives === samples.length) {
    return {leaf: true, probability};
  }
  const featureCount = X[0].length;
  const features = chooseFeatures(featureCount, Math.max(1, Math.round(Math.sqrt(featureCount))), random);
  const split = bestSplit(X, y, samples, features, options.minLeaf);
  if (!split || split.impurity >= gini(positives, samples.length)) return {leaf: true, probability};
  const left = samples.filter(sample => X[sample][split.feature] <= split.threshold);
  const right = samples.filter(sample => X[sample][split.feature] > split.threshold);
  return {
    leaf: false,
    feature: split.feature,
    threshold: split.threshold,
    left: buildTree(X, y, left, depth + 1, options, random),
    right: buildTree(X, y, right, depth + 1, options, random),
  };
};

const predictTree = (node: TreeNode, row: readonly number[]): number => {
  let current = node;
  while (!current.leaf) current = row[current.feature] <= current.threshold ? current.left : current.right;
  return current.probability;
};

/** Trains a bagged forest of CART trees with Gini splits and a random feature subset at each split. */
export const trainRandomForest = (
  X: readonly number[][],
  y: readonly Label[],
  options: RandomForestOptions,
): RandomForest => {
  if (X.length === 0 || X.length !== y.length) throw new Error('Training data is empty or misaligned.');
  const random = createRandom(options.seed);
  const trees: TreeNode[] = [];
  const oobSum = new Array<number>(X.length).fill(0);
  const oobVotes = new Array<number>(X.length).fill(0);
  for (let treeIndex = 0; treeIndex < options.trees; treeIndex += 1) {
    const inBag = new Array<boolean>(X.length).fill(false);
    const samples = X.map(() => {
      const sample = Math.floor(random() * X.length);
      inBag[sample] = true;
      return sample;
    });
    const tree = buildTree(X, y, samples, 0, options, random);
    trees.push(tree);
    inBag.forEach((used, sample) => {
      if (used) return;
      oobSum[sample] += predictTree(tree, X[sample]);
      oobVotes[sample] += 1;
    });
  }
  let scored = 0;
  let correct = 0;
  oobVotes.forEach((votes, sample) => {
    if (votes === 0) return;
    scored += 1;
    if ((oobSum[sample] / votes >= 0.5 ? 1 : 0) === y[sample]) correct += 1;
  });
  return {trees, sampleSize: X.length, oobAccuracy: scored > 0 ? correct / scored : null};
};

/** The forest's probability of label 1: the mean of its trees' leaf probabilities. */
export const predictProbability = (forest: RandomForest, row: readonly number[]): number =>
  forest.trees.reduce((sum, tree) => sum + predictTree(tree, row), 0) / forest.trees.length;
