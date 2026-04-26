type NodeItem = {
  id: string;
  label: string;
  children: NodeItem[];
};

function parseMindMap(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, '  '))
    .filter((line) => line.trim());
  const root: NodeItem = { id: 'root', label: 'root', children: [] };
  const stack: Array<{ depth: number; node: NodeItem }> = [{ depth: -1, node: root }];

  for (const line of lines) {
    const depth = Math.floor((line.match(/^ */)?.[0].length ?? 0) / 2);
    const label = line.trim().replace(/^[-*#]+\s*/, '');
    const node: NodeItem = {
      id: `${depth}-${label}-${stack.length}`,
      label,
      children: []
    };

    while (stack.length && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  }

  return root.children;
}

function Tree({ items }: { items: NodeItem[] }) {
  return (
    <ul className="mindmap-tree">
      {items.map((item) => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.children.length ? <Tree items={item.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function MindMapBlock({ raw }: { raw: string }) {
  const items = parseMindMap(raw);
  return (
    <div className="special-block">
      <div className="special-block-title">思维导图</div>
      {items.length ? <Tree items={items} /> : <pre>{raw}</pre>}
    </div>
  );
}
