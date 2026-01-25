import { WorkflowDef, TaskDef } from '../types/conductor';

/**
 * AI Prompt Template System
 */

export const generateWorkflowSuggestionPrompt = (userRequest: string, currentWorkflow: WorkflowDef | null) => {
    const context = currentWorkflow
        ? `Current Workflow State:\n${JSON.stringify(currentWorkflow, null, 2)}`
        : 'Initial state: No workflow defined yet.';

    return `
User Request: ${userRequest}

${context}

Please provide a JSON suggestion that fulfills the user's request. 
If modifying the current workflow, return the ENTIRE updated JSON.
Wrap the JSON in triple backticks with 'json' label.
`;
};

export const generateParameterHintPrompt = (task: TaskDef, workflow: WorkflowDef | null) => {
    return `
Context: I am configuring a Conductor task in a workflow.
Task Reference Name: ${task.taskReferenceName}
Task Type: ${task.type}

Full Workflow Structure for reference:
${JSON.stringify(workflow, null, 2)}

Requirement: Suggest 3 meaningful 'inputParameters' or JSONPath expressions for this task based on the workflow context.
Return the suggestions as a JSON array of objects with { label, value, description }.
`;
};
