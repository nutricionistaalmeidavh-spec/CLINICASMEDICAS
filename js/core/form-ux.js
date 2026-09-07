(function (root) {
  const REQUIRED_CONTROL_IDS = [
    'pac-nome',
    'ag-paciente', 'ag-profissional', 'ag-data', 'ag-hora',
    'pep-paciente', 'pep-profissional',
    'grade-prof', 'grade-inicio', 'grade-fim',
    'prof-nome',
    'conv-nome', 'proc-nome',
    'doc-paciente'
  ];

  let validationEventsBound = false;
  let observer = null;

  function associateFormLabels(scope = document) {
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll('label:not([for])').forEach(label => {
      const group = label.closest('.form-group, .field-group') || label.parentElement;
      const control = group?.querySelector?.('input[id], select[id], textarea[id]');
      if (control?.id) label.htmlFor = control.id;
    });
  }

  function markRequiredControls(scope = document) {
    REQUIRED_CONTROL_IDS.forEach(id => {
      const control = document.getElementById(id);
      if (control) control.required = true;
    });
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll('input[required], select[required], textarea[required]').forEach(control => {
      control.setAttribute('aria-required', 'true');
    });
  }

  function validationMessageId(control) {
    return control?.id ? `${control.id}-validation-message` : '';
  }

  function isRequiredEmpty(control) {
    if (!control?.required || control.disabled || control.hidden) return false;
    if (control.type === 'checkbox' || control.type === 'radio') return !control.checked;
    return !String(control.value ?? '').trim();
  }

  function clearInlineValidation(control) {
    if (!control) return;
    const messageId = validationMessageId(control);
    if (messageId) document.getElementById(messageId)?.remove();
    control.removeAttribute('aria-invalid');
    if (messageId) {
      const describedBy = String(control.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter(id => id !== messageId);
      if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
      else control.removeAttribute('aria-describedby');
    }
  }

  function showInlineValidation(control, message = 'Campo obrigatório.') {
    if (!control?.id) return;
    const messageId = validationMessageId(control);
    let messageNode = document.getElementById(messageId);
    if (!messageNode) {
      messageNode = document.createElement('span');
      messageNode.id = messageId;
      messageNode.className = 'form-validation-message';
      messageNode.setAttribute('role', 'alert');
      control.insertAdjacentElement('afterend', messageNode);
    }
    messageNode.textContent = message;
    control.setAttribute('aria-invalid', 'true');
    const describedBy = new Set(String(control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(messageId);
    control.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
  }

  function validateControl(control) {
    if (!control?.required) return true;
    if (isRequiredEmpty(control)) {
      showInlineValidation(control);
      return false;
    }
    if (typeof control.checkValidity === 'function' && !control.checkValidity()) {
      showInlineValidation(control, control.validationMessage || 'Verifique este campo.');
      return false;
    }
    clearInlineValidation(control);
    return true;
  }

  function bindInlineValidation() {
    if (validationEventsBound || typeof document === 'undefined') return;
    validationEventsBound = true;

    document.addEventListener('invalid', event => {
      const control = event.target;
      if (control?.matches?.('input, select, textarea')) {
        showInlineValidation(control, control.validationMessage || 'Verifique este campo.');
      }
    }, true);

    document.addEventListener('blur', event => {
      const control = event.target;
      if (control?.matches?.('input[required], select[required], textarea[required]')) validateControl(control);
    }, true);

    const clearWhenResolved = event => {
      const control = event.target;
      if (!control?.matches?.('input, select, textarea')) return;
      if (!control.required || !isRequiredEmpty(control)) clearInlineValidation(control);
    };
    document.addEventListener('input', clearWhenResolved, true);
    document.addEventListener('change', clearWhenResolved, true);
  }

  function enhanceForms(scope = document) {
    associateFormLabels(scope);
    markRequiredControls(scope);
  }

  function observeDynamicForms() {
    if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('input, select, textarea, label, .form-group, .field-group') || node.querySelector?.('input, select, textarea, label')) {
            enhanceForms(node.matches?.('.form-group, .field-group') ? node : node.parentElement || node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setup() {
    if (typeof document === 'undefined') return;
    enhanceForms(document);
    bindInlineValidation();
    observeDynamicForms();
  }

  root.PlennusFormUX = {
    REQUIRED_CONTROL_IDS,
    associateFormLabels,
    markRequiredControls,
    bindInlineValidation,
    showInlineValidation,
    clearInlineValidation,
    validateControl,
    enhanceForms,
    setup
  };
})(typeof window !== 'undefined' ? window : globalThis);
