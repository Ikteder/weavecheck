const EXPRESSION_OPERATORS = new Set([
  "add", "sub", "mul", "eq", "neq", "gt", "gte", "lt", "lte", "and", "or", "not",
]);

const STEP_OPERATIONS = new Set(["read", "write", "acquire", "release", "assert", "yield"]);

export class ModelError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertName(value, path) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new ModelError(`${path} must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/`);
  }
}

function validateExpression(expression, path, sharedNames, localNames) {
  if (["string", "number", "boolean"].includes(typeof expression) || expression === null) {
    return;
  }
  if (!isPlainObject(expression)) {
    throw new ModelError(`${path} must be a JSON scalar or expression object`);
  }
  const keys = Object.keys(expression);
  if (keys.length !== 1) {
    throw new ModelError(`${path} must contain exactly one expression operator`);
  }
  const operator = keys[0];
  const operand = expression[operator];
  if (operator === "shared") {
    assertName(operand, `${path}.shared`);
    if (!sharedNames.has(operand)) {
      throw new ModelError(`${path} references unknown shared value '${operand}'`);
    }
    return;
  }
  if (operator === "local") {
    assertName(operand, `${path}.local`);
    localNames.add(operand);
    return;
  }
  if (!EXPRESSION_OPERATORS.has(operator)) {
    throw new ModelError(`${path} uses unsupported operator '${operator}'`);
  }
  if (operator === "not") {
    validateExpression(operand, `${path}.not`, sharedNames, localNames);
    return;
  }
  if (!Array.isArray(operand) || operand.length < 2) {
    throw new ModelError(`${path}.${operator} must be an array with at least two operands`);
  }
  operand.forEach((item, index) => validateExpression(item, `${path}.${operator}[${index}]`, sharedNames, localNames));
}

function validateConditionList(items, path, sharedNames) {
  if (items === undefined) return [];
  if (!Array.isArray(items)) throw new ModelError(`${path} must be an array`);
  const seen = new Set();
  return items.map((item, index) => {
    if (!isPlainObject(item)) throw new ModelError(`${path}[${index}] must be an object`);
    assertName(item.id, `${path}[${index}].id`);
    if (seen.has(item.id)) throw new ModelError(`${path} contains duplicate id '${item.id}'`);
    seen.add(item.id);
    validateExpression(item.condition, `${path}[${index}].condition`, sharedNames, new Set());
    return { id: item.id, condition: item.condition, message: String(item.message ?? item.id) };
  });
}

export function validateModel(input) {
  if (!isPlainObject(input)) throw new ModelError("model must be a JSON object");
  if (typeof input.name !== "string" || input.name.trim() === "") throw new ModelError("name must be a non-empty string");
  if (!isPlainObject(input.initial) || Object.keys(input.initial).length === 0) {
    throw new ModelError("initial must be a non-empty object of shared values");
  }
  const sharedNames = new Set(Object.keys(input.initial));
  for (const name of sharedNames) {
    assertName(name, `initial.${name}`);
    const value = input.initial[name];
    if (!["string", "number", "boolean"].includes(typeof value) && value !== null) {
      throw new ModelError(`initial.${name} must be a JSON scalar`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new ModelError(`initial.${name} must be finite`);
  }

  const locks = input.locks ?? [];
  if (!Array.isArray(locks)) throw new ModelError("locks must be an array");
  const lockSet = new Set();
  for (const [index, lock] of locks.entries()) {
    assertName(lock, `locks[${index}]`);
    if (lockSet.has(lock)) throw new ModelError(`locks contains duplicate '${lock}'`);
    lockSet.add(lock);
  }

  if (!Array.isArray(input.actors) || input.actors.length < 1) throw new ModelError("actors must be a non-empty array");
  const actorIds = new Set();
  const actors = input.actors.map((actor, actorIndex) => {
    const base = `actors[${actorIndex}]`;
    if (!isPlainObject(actor)) throw new ModelError(`${base} must be an object`);
    assertName(actor.id, `${base}.id`);
    if (actorIds.has(actor.id)) throw new ModelError(`actors contains duplicate id '${actor.id}'`);
    actorIds.add(actor.id);
    if (!Array.isArray(actor.steps) || actor.steps.length < 1) throw new ModelError(`${base}.steps must be non-empty`);
    const locals = new Set();
    const steps = actor.steps.map((step, stepIndex) => {
      const stepPath = `${base}.steps[${stepIndex}]`;
      if (!isPlainObject(step) || !STEP_OPERATIONS.has(step.op)) throw new ModelError(`${stepPath}.op is unsupported`);
      const normalized = { ...step, label: String(step.label ?? `${step.op} ${stepIndex + 1}`) };
      if (step.op === "read") {
        assertName(step.from, `${stepPath}.from`);
        assertName(step.into, `${stepPath}.into`);
        if (!sharedNames.has(step.from)) throw new ModelError(`${stepPath}.from references unknown shared value '${step.from}'`);
        locals.add(step.into);
      } else if (step.op === "write") {
        assertName(step.to, `${stepPath}.to`);
        if (!sharedNames.has(step.to)) throw new ModelError(`${stepPath}.to references unknown shared value '${step.to}'`);
        validateExpression(step.value, `${stepPath}.value`, sharedNames, locals);
      } else if (step.op === "acquire" || step.op === "release") {
        assertName(step.lock, `${stepPath}.lock`);
        if (!lockSet.has(step.lock)) throw new ModelError(`${stepPath}.lock references unknown lock '${step.lock}'`);
      } else if (step.op === "assert") {
        validateExpression(step.condition, `${stepPath}.condition`, sharedNames, locals);
      }
      return normalized;
    });
    return { id: actor.id, steps };
  });

  const invariants = validateConditionList(input.invariants, "invariants", sharedNames);
  const terminal = validateConditionList(input.expect?.terminal, "expect.terminal", sharedNames);
  return {
    name: input.name.trim(),
    description: String(input.description ?? ""),
    initial: structuredClone(input.initial),
    locks: [...locks],
    actors,
    invariants,
    expect: { terminal },
  };
}

function evaluate(expression, state, actorIndex) {
  if (!isPlainObject(expression)) return expression;
  const [operator, operand] = Object.entries(expression)[0];
  if (operator === "shared") return state.shared[operand];
  if (operator === "local") {
    if (!(operand in state.locals[actorIndex])) throw new ModelError(`local '${operand}' was read before assignment`);
    return state.locals[actorIndex][operand];
  }
  if (operator === "not") return !Boolean(evaluate(operand, state, actorIndex));
  const values = operand.map((item) => evaluate(item, state, actorIndex));
  switch (operator) {
    case "add": return values.reduce((sum, value) => sum + Number(value), 0);
    case "sub": return values.slice(1).reduce((result, value) => result - Number(value), Number(values[0]));
    case "mul": return values.reduce((result, value) => result * Number(value), 1);
    case "eq": return values.every((value) => Object.is(value, values[0]));
    case "neq": return !values.every((value) => Object.is(value, values[0]));
    case "gt": return values.every((value, index) => index === 0 || values[index - 1] > value);
    case "gte": return values.every((value, index) => index === 0 || values[index - 1] >= value);
    case "lt": return values.every((value, index) => index === 0 || values[index - 1] < value);
    case "lte": return values.every((value, index) => index === 0 || values[index - 1] <= value);
    case "and": return values.every(Boolean);
    case "or": return values.some(Boolean);
    default: throw new ModelError(`unsupported operator '${operator}'`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function stateKey(state) {
  return canonical({ shared: state.shared, pcs: state.pcs, locals: state.locals, locks: state.locks });
}

function cloneState(state) {
  return {
    shared: structuredClone(state.shared),
    pcs: [...state.pcs],
    locals: state.locals.map((locals) => ({ ...locals })),
    locks: { ...state.locks },
  };
}

function isTerminal(state, model) {
  return state.pcs.every((pc, index) => pc >= model.actors[index].steps.length);
}

function enabledActors(state, model) {
  const enabled = [];
  for (let index = 0; index < model.actors.length; index += 1) {
    const step = model.actors[index].steps[state.pcs[index]];
    if (!step) continue;
    if (step.op !== "acquire" || state.locks[step.lock] === null) enabled.push(index);
  }
  return enabled;
}

function snapshot(state) {
  return { shared: structuredClone(state.shared), locals: structuredClone(state.locals), locks: { ...state.locks } };
}

function applyStep(state, model, actorIndex) {
  const next = cloneState(state);
  const actor = model.actors[actorIndex];
  const stepIndex = next.pcs[actorIndex];
  const step = actor.steps[stepIndex];
  let executionError = null;
  try {
    switch (step.op) {
      case "read": next.locals[actorIndex][step.into] = next.shared[step.from]; break;
      case "write": next.shared[step.to] = evaluate(step.value, next, actorIndex); break;
      case "acquire": next.locks[step.lock] = actor.id; break;
      case "release":
        if (next.locks[step.lock] !== actor.id) executionError = `${actor.id} released unowned lock '${step.lock}'`;
        else next.locks[step.lock] = null;
        break;
      case "assert":
        if (!Boolean(evaluate(step.condition, next, actorIndex))) executionError = String(step.message ?? `assertion failed in ${actor.id}`);
        break;
      case "yield": break;
      default: executionError = `unsupported operation '${step.op}'`;
    }
  } catch (error) {
    executionError = error.message;
  }
  next.pcs[actorIndex] += 1;
  return {
    state: next,
    executionError,
    event: { actor: actor.id, step: stepIndex + 1, op: step.op, label: step.label, ...snapshot(next) },
  };
}

function traceFor(key, nodes) {
  const trace = [];
  let cursor = key;
  while (nodes.get(cursor)?.parent !== null) {
    const node = nodes.get(cursor);
    trace.push(node.event);
    cursor = node.parent;
  }
  return trace.reverse();
}

function issueKey(issue) {
  return `${issue.kind}:${issue.id}:${canonical(issue.state.shared)}:${canonical(issue.state.locks)}`;
}

export function explore(input, options = {}) {
  const model = validateModel(input);
  const maxStates = Number(options.maxStates ?? 100000);
  if (!Number.isInteger(maxStates) || maxStates < 1) throw new ModelError("maxStates must be a positive integer");
  const initial = {
    shared: structuredClone(model.initial),
    pcs: model.actors.map(() => 0),
    locals: model.actors.map(() => ({})),
    locks: Object.fromEntries(model.locks.map((lock) => [lock, null])),
  };
  const initialKey = stateKey(initial);
  const queue = [initialKey];
  const nodes = new Map([[initialKey, { state: initial, parent: null, event: null, depth: 0 }]]);
  const issues = [];
  const issueKeys = new Set();
  const outcomes = new Map();
  let transitions = 0;
  let maxDepth = 0;
  let terminalStates = 0;
  let deadlocks = 0;
  let truncated = false;

  const addIssue = (issue, nodeKey, state) => {
    const full = { ...issue, state: snapshot(state), trace: traceFor(nodeKey, nodes) };
    const key = issueKey(full);
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(full);
    }
  };

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const key = queue[cursor];
    const node = nodes.get(key);
    const { state } = node;
    maxDepth = Math.max(maxDepth, node.depth);
    if (isTerminal(state, model)) {
      terminalStates += 1;
      const outcomeKey = canonical(state.shared);
      if (!outcomes.has(outcomeKey)) outcomes.set(outcomeKey, { shared: structuredClone(state.shared), trace: traceFor(key, nodes) });
      for (const expectation of model.expect.terminal) {
        if (!Boolean(evaluate(expectation.condition, state, 0))) {
          addIssue({ kind: "terminal-expectation", id: expectation.id, message: expectation.message }, key, state);
        }
      }
      const held = Object.entries(state.locks).filter(([, owner]) => owner !== null);
      if (held.length) addIssue({ kind: "lock-leak", id: "held-at-terminal", message: `terminal state retains ${held.length} lock(s)` }, key, state);
      continue;
    }

    const enabled = enabledActors(state, model);
    if (enabled.length === 0) {
      deadlocks += 1;
      addIssue({ kind: "deadlock", id: "no-runnable-actor", message: "unfinished actors are blocked and no step can run" }, key, state);
      continue;
    }

    for (const actorIndex of enabled) {
      transitions += 1;
      const applied = applyStep(state, model, actorIndex);
      const nextKey = stateKey(applied.state);
      if (!nodes.has(nextKey)) {
        if (nodes.size >= maxStates) {
          truncated = true;
          continue;
        }
        nodes.set(nextKey, { state: applied.state, parent: key, event: applied.event, depth: node.depth + 1 });
        queue.push(nextKey);
      }
      const storedKey = nodes.has(nextKey) ? nextKey : key;
      if (applied.executionError) {
        addIssue({ kind: "execution-error", id: `${model.actors[actorIndex].id}-step-${state.pcs[actorIndex] + 1}`, message: applied.executionError }, storedKey, applied.state);
      }
      for (const invariant of model.invariants) {
        if (!Boolean(evaluate(invariant.condition, applied.state, actorIndex))) {
          addIssue({ kind: "invariant", id: invariant.id, message: invariant.message }, storedKey, applied.state);
        }
      }
    }
  }

  const status = truncated ? "inconclusive" : issues.length > 0 ? "unsafe" : "safe";
  return {
    schemaVersion: 1,
    tool: "WeaveCheck 0.1.0",
    model: { name: model.name, description: model.description, actors: model.actors.map((actor) => actor.id), locks: model.locks },
    status,
    limits: { maxStates, truncated },
    metrics: {
      statesExplored: nodes.size,
      transitions,
      maxDepth,
      terminalStates,
      uniqueOutcomes: outcomes.size,
      deadlocks,
      issues: issues.length,
    },
    outcomes: [...outcomes.values()],
    issues,
  };
}
