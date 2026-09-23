// Shared deterministic view engine. All database configuration is local-only.
export const typeNames = {
  text: '文本',
  number: '数字',
  select: '单选',
  multiSelect: '多选',
  date: '日期',
  checkbox: '复选框',
  url: '链接',
  relation: '关联论文',
  formula: '公式',
  rollup: '汇总',
};
export const formulaResultTypes = {
  text: '文本',
  number: '数字',
  checkbox: '复选框',
  date: '日期',
};
export const rollupAggregates = {
  count: '计数',
  sum: '求和',
  average: '平均值',
  min: '最小值',
  max: '最大值',
  unique: '去重文本',
};
const computedTypes = new Set(['formula', 'rollup']);
export const labels = {
  unread: '待阅读',
  reading: '阅读中',
  reviewed: '已整理',
  draft: '草稿',
  active: '已入库',
  archived: '已归档',
  private: '私有',
  public: '允许公开',
};
export const layouts = {
  table: '表格',
  board: '看板',
  gallery: '画廊',
  list: '列表',
  calendar: '日历',
};
export const builtins = [
  { id: 'title', name: '论文', type: 'text', readonly: true },
  { id: 'year', name: '年份', type: 'number' },
  { id: 'status', name: '阅读状态', type: 'select', options: ['unread', 'reading', 'reviewed'] },
  { id: 'topics', name: '专题', type: 'multiSelect' },
  { id: 'tags', name: '标签', type: 'multiSelect' },
  { id: 'lifecycle', name: '入库状态', type: 'select', options: ['draft', 'active', 'archived'] },
  { id: 'updated', name: '更新日期', type: 'date', readonly: true },
  {
    id: 'visibility',
    name: '可见性',
    type: 'select',
    readonly: true,
    options: ['private', 'public'],
  },
];
export function makeView(id = 'view-all', name = '全部论文', layout = 'table') {
  return {
    id,
    name,
    layout,
    query: '',
    filters: { mode: 'and', rules: [] },
    sorts: [{ field: 'year', direction: 'desc' }],
    columns: ['title', 'year', 'status', 'topics', 'tags'],
    groupBy: 'status',
    dateField: 'updated',
    showArchived: false,
    density: 'comfortable',
  };
}
export function defaultDatabase() {
  return {
    version: 1,
    properties: [],
    views: [
      makeView(),
      makeView('view-reading', '阅读进度', 'board'),
      makeView('view-gallery', '论文卡片', 'gallery'),
      makeView('view-calendar', '更新日历', 'calendar'),
    ],
  };
}
export function fieldsFor(database = defaultDatabase(), dataset = {}) {
  const base = [
    ...builtins.map((f) => ({
      ...f,
      ...(f.id === 'topics' ? { options: (dataset.topics || []).map((t) => t.id) } : {}),
      ...(f.id === 'tags'
        ? { options: [...new Set((dataset.papers || []).flatMap((p) => p.tags || []))].sort() }
        : {}),
    })),
  ];
  const fields = [...base];
  for (const p of database.properties) {
    let type = p.type;
    if (p.type === 'formula') type = p.resultType || 'text';
    if (p.type === 'rollup') {
      if (p.aggregate === 'count') type = 'number';
      else if (p.aggregate === 'unique') type = 'multiSelect';
      else {
        const source = fields.find((f) => f.id === p.source);
        type = source?.type || 'number';
      }
    }
    fields.push({
      ...p,
      id: 'custom:' + p.id,
      custom: true,
      propertyType: p.type,
      type,
      readonly: computedTypes.has(p.type),
      ...(p.type === 'relation' ? { options: (dataset.papers || []).map((x) => x.id) } : {}),
    });
  }
  return fields;
}
const fieldReference = (value, database) => {
  const text = String(value || '');
  return text.startsWith('custom:') || builtins.some((field) => field.id === text)
    ? text
    : 'custom:' + text;
};
const formulaTokens = (source) => {
  const tokens = [];
  let i = 0;
  const push = (type, value) => tokens.push({ type, value });
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = i++;
      while (i < source.length && /[0-9.]/.test(source[i])) i++;
      const value = Number(source.slice(start, i));
      if (!Number.isFinite(value)) throw Error('数字格式无效');
      push('value', value);
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char,
        start = ++i;
      let value = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) i++;
        value += source[i++];
      }
      if (source[i] !== quote) throw Error('字符串缺少结束引号');
      i++;
      push('value', value);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_:.-]/.test(source[i])) i++;
      push('name', source.slice(start, i));
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(pair)) {
      push('op', pair);
      i += 2;
      continue;
    }
    if ('+-*/%><!(),'.includes(char)) {
      push(char === '(' || char === ')' || char === ',' ? char : 'op', char);
      i++;
      continue;
    }
    throw Error(`不支持的公式字符：${char}`);
  }
  push('eof', '');
  return tokens;
};
function parseFormula(source, resolve) {
  const tokens = formulaTokens(String(source || '').trim());
  let index = 0;
  const peek = () => tokens[index];
  const take = (type, value) => {
    const token = peek();
    if (token.type !== type || (value !== undefined && token.value !== value))
      throw Error(`公式语法错误，期望 ${value || type}`);
    index++;
    return token.value;
  };
  const primary = () => {
    const token = peek();
    if (token.type === 'value') {
      index++;
      return token.value;
    }
    if (token.type === 'name') {
      index++;
      if (peek().type !== '(') {
        if (token.value === 'true') return true;
        if (token.value === 'false') return false;
        if (token.value === 'null') return null;
        throw Error(`未知字段或函数：${token.value}`);
      }
      take('(');
      const args = [];
      if (peek().type !== ')') {
        while (true) {
          args.push(expression());
          if (peek().type !== ',') break;
          take(',');
        }
      }
      take(')');
      return resolve(token.value, args);
    }
    if (token.type === '(') {
      take('(');
      const result = expression();
      take(')');
      return result;
    }
    throw Error('公式缺少值');
  };
  const unary = () => {
    if (peek().type === 'op' && ['!', '-'].includes(peek().value)) {
      const op = take('op');
      const value = unary();
      return op === '!' ? !value : typeof value === 'number' ? -value : null;
    }
    return primary();
  };
  const multiplicative = () => {
    let left = unary();
    while (peek().type === 'op' && ['*', '/', '%'].includes(peek().value)) {
      const op = take('op'),
        right = unary();
      if (typeof left !== 'number' || typeof right !== 'number') left = null;
      else if (op === '*') left *= right;
      else if (op === '/') left = right === 0 ? null : left / right;
      else left = right === 0 ? null : left % right;
    }
    return left;
  };
  const additive = () => {
    let left = multiplicative();
    while (peek().type === 'op' && ['+', '-'].includes(peek().value)) {
      const op = take('op'),
        right = multiplicative();
      if (op === '+' && (typeof left === 'string' || typeof right === 'string'))
        left = String(left ?? '') + String(right ?? '');
      else if (typeof left !== 'number' || typeof right !== 'number') left = null;
      else left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const comparison = () => {
    let left = additive();
    while (peek().type === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(peek().value)) {
      const op = take('op'),
        right = additive();
      if (op === '==') left = left === right;
      else if (op === '!=') left = left !== right;
      else if (op === '>') left = left > right;
      else if (op === '>=') left = left >= right;
      else if (op === '<') left = left < right;
      else left = left <= right;
    }
    return left;
  };
  const conjunction = () => {
    let left = comparison();
    while (peek().type === 'op' && ['&&', '||'].includes(peek().value)) {
      const op = take('op'),
        right = comparison();
      left = op === '&&' ? Boolean(left && right) : Boolean(left || right);
    }
    return left;
  };
  function expression() {
    return conjunction();
  }
  const result = expression();
  if (peek().type !== 'eof') throw Error('公式末尾有多余内容');
  return result;
}
export function formulaReferences(expression) {
  const references = [];
  try {
    parseFormula(expression, (name, args) => {
      if (!['prop', 'length', 'count', 'sum', 'ifEmpty', 'if', 'concat', 'round'].includes(name))
        throw Error('未知公式函数');
      if (name === 'prop') {
        if (args.length !== 1 || typeof args[0] !== 'string') throw Error('prop 参数无效');
        references.push(String(args[0]));
      }
      return null;
    });
  } catch {
    return null;
  }
  return references;
}
function formulaValue(expression, paper, database, dataset, stack) {
  return parseFormula(expression, (name, args) => {
    if (name === 'prop') {
      if (args.length !== 1 || typeof args[0] !== 'string') throw Error('prop 需要一个字段 ID');
      return valueOf(paper, fieldReference(args[0], database), database, dataset, stack);
    }
    if (name === 'length' || name === 'count') {
      if (args.length !== 1) throw Error(`${name} 需要一个参数`);
      return Array.isArray(args[0]) || typeof args[0] === 'string' ? args[0].length : 0;
    }
    if (name === 'sum') {
      const values = Array.isArray(args[0]) ? args[0] : args;
      return values.filter((x) => typeof x === 'number').reduce((a, b) => a + b, 0);
    }
    if (name === 'ifEmpty') return args[0] == null || args[0] === '' ? (args[1] ?? null) : args[0];
    if (name === 'if') return args.length === 3 ? (args[0] ? args[1] : args[2]) : null;
    if (name === 'concat') return args.map((x) => String(x ?? '')).join('');
    if (name === 'round') return typeof args[0] === 'number' ? Math.round(args[0]) : null;
    throw Error(`不支持的公式函数：${name}`);
  });
}
function computedValue(paper, property, database, dataset, stack = []) {
  const key = 'custom:' + property.id;
  if (stack.includes(key)) return null;
  const nextStack = [...stack, key];
  if (property.type === 'formula') {
    try {
      const value = formulaValue(property.expression, paper, database, dataset, nextStack);
      if (property.resultType === 'number')
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (property.resultType === 'checkbox') return Boolean(value);
      if (property.resultType === 'date') return validDate(value) ? value : null;
      return value == null ? null : Array.isArray(value) ? value.join(' · ') : String(value);
    } catch {
      return null;
    }
  }
  const relation = database.properties.find((p) => p.id === property.relation),
    related = relation
      ? (paper.customProperties?.[relation.id] || [])
          .map((id) => dataset.papers.find((p) => p.id === id))
          .filter(Boolean)
      : [];
  if (property.aggregate === 'count') return related.length;
  const source = property.source;
  const sourceValues = related
    .map((item) => valueOf(item, source, database, dataset, nextStack))
    .filter((value) => !empty(value));
  if (property.aggregate === 'unique')
    return [...new Set(sourceValues.flatMap((x) => (Array.isArray(x) ? x : [x])))];
  const numbers = sourceValues.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!numbers.length) return null;
  if (property.aggregate === 'sum') return numbers.reduce((a, b) => a + b, 0);
  if (property.aggregate === 'average') return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return property.aggregate === 'min' ? Math.min(...numbers) : Math.max(...numbers);
}
export function valueOf(paper, field, database, dataset, stack = []) {
  const id = typeof field === 'string' ? field : field?.id;
  if (id?.startsWith('custom:')) {
    const property = database?.properties?.find((p) => p.id === id.slice(7));
    if (property && computedTypes.has(property.type))
      return computedValue(paper, property, database, dataset, stack);
    return paper.customProperties?.[id.slice(7)];
  }
  return paper[id] ?? (id === 'status' ? 'unread' : id === 'lifecycle' ? 'active' : undefined);
}
export const empty = (value) =>
  value == null || value === '' || (Array.isArray(value) && !value.length);
const normalized = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase();
export const operators = {
  is: '等于',
  isNot: '不等于',
  contains: '包含',
  notContains: '不包含',
  empty: '为空',
  notEmpty: '不为空',
  gt: '大于 / 晚于',
  gte: '大于等于',
  lt: '小于 / 早于',
  lte: '小于等于',
};
export function operatorsFor(field) {
  return [
    'is',
    'isNot',
    ...(['text', 'url', 'multiSelect', 'relation'].includes(field.type)
      ? ['contains', 'notContains']
      : []),
    ...(['number', 'date'].includes(field.type) ? ['gt', 'gte', 'lt', 'lte'] : []),
    'empty',
    'notEmpty',
  ];
}
function matches(paper, rule, fields, database, dataset) {
  if (rule.rules)
    return rule.mode === 'or'
      ? !rule.rules.length || rule.rules.some((r) => matches(paper, r, fields, database, dataset))
      : rule.rules.every((r) => matches(paper, r, fields, database, dataset));
  const field = fields.find((f) => f.id === rule.field);
  if (!field) return false;
  const actual = valueOf(paper, rule.field, database, dataset),
    target = rule.value;
  if (rule.op === 'empty') return empty(actual);
  if (rule.op === 'notEmpty') return !empty(actual);
  if (empty(actual)) return rule.op === 'isNot' || rule.op === 'notContains';
  const equal = Array.isArray(actual)
    ? actual.some((v) => normalized(v) === normalized(target))
    : normalized(actual) === normalized(target);
  if (rule.op === 'is') return equal;
  if (rule.op === 'isNot') return !equal;
  const contains = Array.isArray(actual) ? equal : normalized(actual).includes(normalized(target));
  if (rule.op === 'contains') return contains;
  if (rule.op === 'notContains') return !contains;
  const a = field.type === 'number' ? Number(actual) : String(actual),
    b = field.type === 'number' ? Number(target) : String(target);
  return { gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[rule.op] || false;
}
export function queryRows(dataset, database, view) {
  const fields = fieldsFor(database, dataset),
    q = normalized(view.query).trim();
  return dataset.papers
    .filter(
      (p) =>
        (view.showArchived || p.lifecycle !== 'archived') &&
        (!q ||
          normalized(
            [p.title, p.acronym, ...(p.authors || []), ...(p.tags || [])].join(' '),
          ).includes(q)) &&
        matches(p, view.filters, fields, database, dataset),
    )
    .sort((a, b) => {
      for (const sort of view.sorts) {
        const av = valueOf(a, sort.field, database, dataset),
          bv = valueOf(b, sort.field, database, dataset);
        if (empty(av) || empty(bv)) {
          if (empty(av) !== empty(bv)) return empty(av) ? 1 : -1;
          else continue;
        }
        const order =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv), 'zh-CN', { numeric: true });
        if (order) return sort.direction === 'desc' ? -order : order;
      }
      return a.id.localeCompare(b.id);
    });
}
export function groupRows(rows, field, database, dataset) {
  const groups = new Map((field.options || []).map((x) => [String(x), []]));
  for (const p of rows) {
    const value = valueOf(p, field.id, database, dataset),
      keys = empty(value) ? [''] : Array.isArray(value) ? value : [String(value)];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
  }
  return [...groups].map(([key, papers]) => ({ key, papers }));
}
export function displayValue(value, field, dataset) {
  if (empty(value)) return '—';
  const label = (x) =>
    field.id === 'topics'
      ? dataset.topics.find((t) => t.id === x)?.title || x
      : field.type === 'relation'
        ? dataset.papers.find((p) => p.id === x)?.acronym ||
          dataset.papers.find((p) => p.id === x)?.title ||
          x
        : ['status', 'lifecycle', 'visibility'].includes(field.id) && Object.hasOwn(labels, x)
          ? labels[x]
          : String(x);
  if (field.type === 'checkbox') return value === true || value === 'true' ? '已勾选' : '未勾选';
  return Array.isArray(value) ? value.map(label).join(' · ') : label(value);
}
export function changeFor(field, value) {
  return field.startsWith('custom:')
    ? { customProperties: { [field.slice(7)]: value } }
    : { [field]: value };
}
export function csvRows(rows, fields, dataset, database) {
  // Neutralize spreadsheet formula prefixes in downloaded user text.
  const cell = (value) =>
    '"' +
    (/^[\s]*[=+@-]/.test(String(value)) ? "'" : '') +
    String(value).replaceAll('"', '""') +
    '"';
  return (
    '\uFEFF' +
    [
      fields.map((f) => f.name),
      ...rows.map((p) =>
        fields.map((f) =>
          empty(valueOf(p, f.id, database, dataset))
            ? ''
            : displayValue(valueOf(p, f.id, database, dataset), f, dataset),
        ),
      ),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}
export function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateDatabase(database, dataset) {
  const errors = [],
    bad = (message) => errors.push(message),
    id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    object = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (
    !object(database) ||
    database.version !== 1 ||
    !Array.isArray(database.properties) ||
    !Array.isArray(database.views)
  )
    return ['Invalid database configuration'];
  if (database.properties.length > 64 || database.views.length > 64 || !database.views.length)
    bad('Database requires 1–64 views and at most 64 properties');
  const ids = new Set(),
    names = new Set();
  for (const p of database.properties) {
    if (
      !object(p) ||
      typeof p.id !== 'string' ||
      !id.test(p.id) ||
      p.id.length > 120 ||
      !Object.hasOwn(typeNames, p.type) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 80
    ) {
      bad('Invalid property definition');
      continue;
    }
    if (ids.has(p.id) || names.has(p.name.trim().toLowerCase()))
      bad('Duplicate property ID or name');
    ids.add(p.id);
    names.add(p.name.trim().toLowerCase());
    if (
      ['select', 'multiSelect'].includes(p.type) &&
      (!Array.isArray(p.options) ||
        p.options.length > 200 ||
        p.options.some((x) => typeof x !== 'string' || !x.trim() || x.length > 120) ||
        new Set(p.options).size !== p.options.length)
    )
      bad('Select properties require unique nonempty options');
    if (p.type === 'formula') {
      if (!Object.hasOwn(formulaResultTypes, p.resultType) || typeof p.expression !== 'string')
        bad('Formula properties require a result type and expression');
      else if (p.expression.length > 500 || !p.expression.trim())
        bad('Formula expression is empty or too long');
      else if (formulaReferences(p.expression) === null) bad('Formula expression is invalid');
    }
    if (p.type === 'rollup') {
      if (typeof p.relation !== 'string' || typeof p.aggregate !== 'string')
        bad('Rollup properties require a relation and aggregate');
      if (!Object.hasOwn(rollupAggregates, p.aggregate)) bad('Unknown rollup aggregate');
      if (p.aggregate !== 'count' && typeof p.source !== 'string')
        bad('Rollup properties require a source field');
    }
  }
  if (errors.length) return errors;
  const fields = fieldsFor(database, dataset),
    byId = new Map(fields.map((f) => [f.id, f])),
    viewIds = new Set();
  for (const property of database.properties) {
    if (property.type === 'formula') {
      const references = formulaReferences(property.expression);
      if (references === null) continue;
      for (const reference of references) {
        const fieldId =
          reference.startsWith('custom:') || builtins.some((f) => f.id === reference)
            ? reference
            : 'custom:' + reference;
        if (!byId.has(fieldId)) bad(`Formula references unknown field ${reference}`);
      }
    }
    if (property.type === 'rollup') {
      const relation = database.properties.find((p) => p.id === property.relation);
      if (!relation || relation.type !== 'relation')
        bad(`Rollup relation is invalid for ${property.id}`);
      if (property.aggregate !== 'count') {
        const source = byId.get(property.source);
        if (!source) bad(`Rollup source is invalid for ${property.id}`);
        else if (
          ['sum', 'average', 'min', 'max'].includes(property.aggregate) &&
          source.type !== 'number'
        )
          bad(`Rollup ${property.aggregate} requires a numeric source for ${property.id}`);
      }
    }
  }
  const computedIds = new Set(
    database.properties.filter((p) => computedTypes.has(p.type)).map((p) => 'custom:' + p.id),
  );
  const visiting = new Set(),
    visited = new Set();
  const visitComputed = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      bad(`Computed property cycle detected at ${id}`);
      return;
    }
    visiting.add(id);
    const property = database.properties.find((p) => 'custom:' + p.id === id);
    const refs =
      property?.type === 'formula'
        ? (formulaReferences(property.expression) || []).map((ref) =>
            ref.startsWith('custom:') ? ref : 'custom:' + ref,
          )
        : property?.type === 'rollup' && property.source?.startsWith('custom:')
          ? [property.source]
          : [];
    refs.filter((ref) => computedIds.has(ref)).forEach(visitComputed);
    visiting.delete(id);
    visited.add(id);
  };
  computedIds.forEach(visitComputed);
  for (const view of database.views) {
    if (
      !object(view) ||
      typeof view.id !== 'string' ||
      !id.test(view.id) ||
      view.id.length > 120 ||
      viewIds.has(view.id) ||
      typeof view.name !== 'string' ||
      !view.name.trim() ||
      view.name.length > 80 ||
      !Object.hasOwn(layouts, view.layout)
    ) {
      bad('Invalid or duplicate view');
      continue;
    }
    viewIds.add(view.id);
    if (
      typeof view.query !== 'string' ||
      view.query.length > 1000 ||
      typeof view.showArchived !== 'boolean' ||
      !['compact', 'comfortable'].includes(view.density)
    )
      bad('Invalid view preferences');
    if (
      !Array.isArray(view.columns) ||
      !view.columns.includes('title') ||
      new Set(view.columns).size !== view.columns.length ||
      view.columns.some((x) => !byId.has(x))
    )
      bad('Invalid view columns');
    if (!byId.has(view.groupBy) || byId.get(view.dateField)?.type !== 'date')
      bad('Invalid grouping or calendar date field');
    if (
      !Array.isArray(view.sorts) ||
      view.sorts.length > 8 ||
      view.sorts.some(
        (s) => !object(s) || !byId.has(s.field) || !['asc', 'desc'].includes(s.direction),
      )
    )
      bad('Invalid view sorts');
    let count = 0;
    function checkRule(rule, depth = 0) {
      if (++count > 100 || depth > 4 || !object(rule)) return bad('Filter is too large or invalid');
      if (Array.isArray(rule.rules)) {
        if (!['and', 'or'].includes(rule.mode)) bad('Invalid filter conjunction');
        rule.rules.forEach((r) => checkRule(r, depth + 1));
      } else {
        const f = byId.get(rule.field);
        if (!f || !operatorsFor(f).includes(rule.op))
          return bad('Invalid filter field or operator');
        if (['empty', 'notEmpty'].includes(rule.op)) return;
        if (
          f.type === 'number'
            ? typeof rule.value !== 'number' || !Number.isFinite(rule.value)
            : f.type === 'checkbox'
              ? typeof rule.value !== 'boolean'
              : typeof rule.value !== 'string' || rule.value.length > 1000
        )
          bad('Invalid typed filter value');
        if (f.type === 'date' && !validDate(rule.value)) bad('Invalid filter date');
      }
    }
    if (!Array.isArray(view.filters?.rules)) bad('Invalid filter group');
    else checkRule(view.filters);
  }
  const paperIds = new Set(dataset.papers.map((p) => p.id));
  for (const paper of dataset.papers)
    for (const [key, value] of Object.entries(paper.customProperties || {})) {
      const p = database.properties.find((p) => p.id === key);
      if (!p) {
        bad(`Unknown custom property ${key} on ${paper.id}`);
        continue;
      }
      if (value == null) continue;
      if (computedTypes.has(p.type)) {
        bad(`Computed property ${key} cannot store a value on ${paper.id}`);
        continue;
      }
      let valid;
      if (p.type === 'number') valid = typeof value === 'number' && Number.isFinite(value);
      else if (p.type === 'checkbox') valid = typeof value === 'boolean';
      else if (p.type === 'date') valid = validDate(value);
      else if (p.type === 'select') valid = p.options.includes(value);
      else if (p.type === 'multiSelect' || p.type === 'relation')
        valid =
          Array.isArray(value) &&
          new Set(value).size === value.length &&
          value.every((x) => (p.type === 'relation' ? paperIds.has(x) : p.options.includes(x)));
      else
        valid =
          typeof value === 'string' &&
          value.length <= 10000 &&
          (p.type !== 'url' || /^https?:\/\/[^\s]+$/.test(value));
      if (!valid) bad(`Invalid ${p.type} value for ${key} on ${paper.id}`);
    }
  return errors;
}
