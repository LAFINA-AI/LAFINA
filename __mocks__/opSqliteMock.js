const path = require('node:path');
const {
  MessageChannel,
  Worker,
  receiveMessageOnPort,
} = require('node:worker_threads');

const REQUEST_TIMEOUT_MS = 30_000;

const workerExecArgv = () => {
  const [major, minor] = process.versions.node
    .split('.')
    .slice(0, 2)
    .map(Number);
  return major === 22 && minor < 13 ? ['--experimental-sqlite'] : undefined;
};

const open = () => {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(path.join(__dirname, 'opSqliteWorker.js'), {
    workerData: { port: port2 },
    transferList: [port2],
    execArgv: workerExecArgv(),
  });
  let isClosed = false;

  const request = (action, payload = {}) => {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    port1.postMessage({ action, ...payload, signal: signal.buffer });
    const waitResult = Atomics.wait(signal, 0, 0, REQUEST_TIMEOUT_MS);
    if (waitResult === 'timed-out') {
      throw new Error(`SQLite test worker timed out during ${action}.`);
    }

    const envelope = receiveMessageOnPort(port1);
    if (!envelope) {
      throw new Error(`SQLite test worker returned no result for ${action}.`);
    }
    if (!envelope.message.ok) {
      throw new Error(envelope.message.error);
    }
    return envelope.message.result;
  };

  const close = () => {
    if (!isClosed) {
      request('close');
      port1.close();
      worker.unref();
      isClosed = true;
    }
  };

  if (typeof afterAll === 'function') {
    afterAll(close);
  }

  return {
    executeSync: (query, params = []) => request('execute', { query, params }),
    close,
  };
};

module.exports = { open };
