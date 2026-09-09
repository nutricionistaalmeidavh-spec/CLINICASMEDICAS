(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreErrors = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  class WorkflowCoreError extends Error {
    constructor(message, code = 'WORKFLOW_CORE_ERROR') {
      super(message);
      this.name = new.target.name;
      this.code = code;
    }
  }

  class WorkflowNotFoundError extends WorkflowCoreError {
    constructor(workflow) {
      super(`Workflow not found: ${workflow}`, 'WORKFLOW_NOT_FOUND');
    }
  }

  class ActionNotFoundError extends WorkflowCoreError {
    constructor(workflow, action) {
      super(`Action not found for workflow ${workflow}: ${action}`, 'ACTION_NOT_FOUND');
    }
  }

  class InvalidTransitionError extends WorkflowCoreError {
    constructor(workflow, action, from, allowed = []) {
      super(`Invalid transition for ${workflow}.${action} from ${from}. Allowed states: ${allowed.join(', ') || 'none'}.`, 'INVALID_TRANSITION');
    }
  }

  class WorkflowAuthorizationError extends WorkflowCoreError {
    constructor(workflow, action) {
      super(`Workflow authorization denied for ${workflow}.${action}.`, 'WORKFLOW_AUTHORIZATION_DENIED');
    }
  }

  class InvalidWorkflowDefinitionError extends WorkflowCoreError {
    constructor(message) {
      super(`Invalid workflow definition: ${message}`, 'INVALID_WORKFLOW_DEFINITION');
    }
  }

  return {
    WorkflowCoreError,
    WorkflowNotFoundError,
    ActionNotFoundError,
    InvalidTransitionError,
    WorkflowAuthorizationError,
    InvalidWorkflowDefinitionError
  };
});
