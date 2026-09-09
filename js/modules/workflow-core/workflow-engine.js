(function (root, factory) {
  const errors = typeof module === 'object' && module.exports
    ? require('./errors')
    : root.WorkflowCoreErrors;
  const api = factory(errors);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function (errors) {
  const {
    WorkflowNotFoundError,
    ActionNotFoundError,
    InvalidTransitionError,
    WorkflowAuthorizationError,
    InvalidWorkflowDefinitionError
  } = errors || {};

  function defaultClock() {
    return new Date().toISOString();
  }

  function defaultIdGenerator() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function validateDefinition(name, definition) {
    if (!definition || typeof definition !== 'object') throw new InvalidWorkflowDefinitionError(`${name} must be an object.`);
    if (!String(definition.aggregateType || '').trim()) throw new InvalidWorkflowDefinitionError(`${name}.aggregateType is required.`);
    if (!definition.transitions || typeof definition.transitions !== 'object' || Array.isArray(definition.transitions)) {
      throw new InvalidWorkflowDefinitionError(`${name}.transitions is required.`);
    }
    for (const [action, transition] of Object.entries(definition.transitions)) {
      if (!transition || typeof transition !== 'object') throw new InvalidWorkflowDefinitionError(`${name}.${action} must be an object.`);
      if (!Array.isArray(transition.from) || !transition.from.length) throw new InvalidWorkflowDefinitionError(`${name}.${action}.from must contain at least one state.`);
      if (!String(transition.to || '').trim()) throw new InvalidWorkflowDefinitionError(`${name}.${action}.to is required.`);
      if (!String(transition.event || '').trim()) throw new InvalidWorkflowDefinitionError(`${name}.${action}.event is required.`);
    }
    if (definition.authorize != null && typeof definition.authorize !== 'function') {
      throw new InvalidWorkflowDefinitionError(`${name}.authorize must be a function.`);
    }
  }

  function createWorkflowEngine({ idGenerator = defaultIdGenerator, clock = defaultClock } = {}) {
    if (typeof idGenerator !== 'function') throw new TypeError('idGenerator must be a function.');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function.');
    const workflows = new Map();

    function registerWorkflow(name, definition) {
      const key = String(name || '').trim();
      if (!key) throw new InvalidWorkflowDefinitionError('workflow name is required.');
      if (workflows.has(key)) throw new InvalidWorkflowDefinitionError(`workflow ${key} is already registered.`);
      validateDefinition(key, definition);
      workflows.set(key, definition);
      return definition;
    }

    function getWorkflow(name) {
      const key = String(name || '').trim();
      const workflow = workflows.get(key);
      if (!workflow) throw new WorkflowNotFoundError(key);
      return workflow;
    }

    function execute(command = {}) {
      const workflowName = String(command.workflow || '').trim();
      const action = String(command.action || '').trim();
      const workflow = getWorkflow(workflowName);
      const transition = workflow.transitions[action];
      if (!transition) throw new ActionNotFoundError(workflowName, action);
      const currentState = String(command.currentState || '').trim();
      if (!transition.from.includes(currentState)) {
        throw new InvalidTransitionError(workflowName, action, currentState, transition.from);
      }

      const context = {
        command,
        actor: command.actor || {},
        source: command.source,
        payload: command.payload || {},
        workflow: workflowName,
        action,
        aggregateId: command.aggregateId,
        currentState,
        transition
      };
      if (typeof workflow.authorize === 'function' && workflow.authorize(context, transition) !== true) {
        throw new WorkflowAuthorizationError(workflowName, action);
      }

      const eventId = String(idGenerator(command) || '').trim();
      if (!eventId) throw new Error('Workflow event id generation failed.');
      const occurredAt = String(clock(command) || '').trim();
      if (!occurredAt) throw new Error('Workflow event timestamp generation failed.');
      const actor = command.actor && typeof command.actor === 'object' ? { ...command.actor } : {};
      const payload = command.payload && typeof command.payload === 'object' ? { ...command.payload } : {};

      return {
        ok: true,
        transition: {
          workflow: workflowName,
          aggregateType: workflow.aggregateType,
          aggregateId: command.aggregateId,
          from: currentState,
          to: transition.to,
          action
        },
        event: {
          eventId,
          type: transition.event,
          aggregateType: workflow.aggregateType,
          aggregateId: command.aggregateId,
          occurredAt,
          actor,
          source: String(command.source || ''),
          mutationId: command.mutationId || null,
          payload
        }
      };
    }

    return {
      registerWorkflow,
      getWorkflow,
      execute,
      workflows
    };
  }

  return { createWorkflowEngine, validateDefinition };
});
