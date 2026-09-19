/**
 * Reads note bodies written by LAFINA desktop.
 *
 * Mobile stores a note body as plain text in a light markdown dialect
 * (`**bold**`, `*italic*`, `==highlight==`, `- [ ] task`). The desktop editor
 * stores sanitized HTML, and notes sync between the two as-is. This module
 * projects a desktop body back to the mobile dialect — the same rules as the
 * desktop's own `htmlToMarkdown` — without a DOM, which React Native lacks.
 * Saving the note on mobile then stores the dialect, which the desktop upgrades
 * back to HTML when it reads it.
 */

interface HtmlElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

interface HtmlText {
  type: 'text';
  text: string;
}

type HtmlNode = HtmlElement | HtmlText;

/** True when a stored body uses the desktop HTML format. */
export const isHtmlBody = (body: string): boolean =>
  /<\/?(p|div|ul|ol|li|h[1-3]|img|br|strong|em|mark|b|i|u|s|blockquote|pre)\b/i.test(body);

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'wbr', 'col', 'area', 'source', 'track']);
const BLOCK_TAGS = /^(p|div|ul|ol|h1|h2|h3|blockquote|pre|hr)$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });

const parseAttributes = (source: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = pattern.exec(source);
  while (match) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    match = pattern.exec(source);
  }
  return attrs;
};

/**
 * Builds a forgiving element tree. Desktop bodies come out of a sanitizer, so
 * they are well formed; a stray end tag closes back to its opener, or is
 * ignored if nothing open matches.
 */
const parseHtml = (html: string): HtmlElement => {
  const root: HtmlElement = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const pattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g;
  let match = pattern.exec(html);
  while (match) {
    const [token, closing, rawTag, rest] = match;
    const parent = stack[stack.length - 1];
    if (token.startsWith('<!--')) {
      // Comments carry nothing a note shows.
    } else if (rawTag) {
      const tag = rawTag.toLowerCase();
      if (closing) {
        const openIndex = stack.map((element) => element.tag).lastIndexOf(tag);
        if (openIndex > 0) stack.length = openIndex;
      } else {
        const element: HtmlElement = {
          type: 'element',
          tag,
          attrs: parseAttributes(rest),
          children: [],
        };
        parent.children.push(element);
        if (!VOID_TAGS.has(tag) && !rest.trim().endsWith('/')) stack.push(element);
      }
    } else {
      parent.children.push({ type: 'text', text: decodeEntities(token) });
    }
    match = pattern.exec(html);
  }
  return root;
};

const textContent = (node: HtmlNode): string =>
  node.type === 'text' ? node.text : node.children.map(textContent).join('');

const inlineToMarkdown = (node: HtmlNode): string => {
  if (node.type === 'text') return node.text;
  const inner = node.children.map(inlineToMarkdown).join('');
  switch (node.tag) {
    case 'br':
      return '\n';
    case 'b':
    case 'strong':
      return inner ? `**${inner}**` : '';
    case 'i':
    case 'em':
      return inner ? `*${inner}*` : '';
    case 'mark':
      return inner ? `==${inner}==` : '';
    case 'code':
      return inner ? `\`${inner}\`` : '';
    case 'img':
      return node.attrs.alt ? `[image: ${node.attrs.alt}]` : '[image]';
    default:
      return inner;
  }
};

const isList = (node: HtmlNode): node is HtmlElement =>
  node.type === 'element' && (node.tag === 'ul' || node.tag === 'ol');

/** Projects a desktop HTML body to the mobile markdown dialect. */
export const htmlToMarkdown = (html: string): string => {
  if (!html) return '';
  const lines: string[] = [];

  const walkBlock = (element: HtmlElement, depth = 0): void => {
    switch (element.tag) {
      case 'ul':
      case 'ol': {
        const isChecklist = (element.attrs.class ?? '').split(/\s+/).includes('lf-checklist');
        // Two spaces per level, which is what the desktop reads back.
        const indent = '  '.repeat(depth);
        let index = 0;
        element.children.forEach((child) => {
          if (child.type !== 'element' || child.tag !== 'li') return;
          index += 1;
          const text = child.children
            .filter((node) => !isList(node))
            .map(inlineToMarkdown)
            .join('')
            .trim();
          if (isChecklist || 'data-checked' in child.attrs) {
            const checked = child.attrs['data-checked'] === 'true';
            lines.push(`${indent}- [${checked ? 'x' : ' '}] ${text}`);
          } else if (element.tag === 'ol') {
            lines.push(`${indent}${index}. ${text}`);
          } else {
            lines.push(`${indent}- ${text}`);
          }
          child.children.filter(isList).forEach((nested) => walkBlock(nested, depth + 1));
        });
        return;
      }
      case 'h1':
      case 'h2':
      case 'h3':
        lines.push(`${'#'.repeat(Number(element.tag[1]))} ${inlineToMarkdown(element).trim()}`);
        return;
      case 'blockquote':
        lines.push(`> ${inlineToMarkdown(element).trim()}`);
        return;
      case 'hr':
        lines.push('---');
        return;
      default: {
        const hasBlockChildren = element.children.some(
          (child) => child.type === 'element' && BLOCK_TAGS.test(child.tag)
        );
        if (hasBlockChildren) {
          element.children.forEach((child) => {
            if (child.type === 'element') walkBlock(child, depth);
            else if (child.text.trim()) lines.push(child.text.trim());
          });
          return;
        }
        lines.push(inlineToMarkdown(element));
      }
    }
  };

  parseHtml(html).children.forEach((child) => {
    if (child.type === 'element') walkBlock(child);
    else if (textContent(child)) lines.push(child.text);
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** A note body in the mobile dialect, whichever app last saved it. */
export const noteBodyToMarkdown = (body: string): string =>
  body && isHtmlBody(body) ? htmlToMarkdown(body) : body;
