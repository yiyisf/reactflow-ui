/**
 * WorkflowFormWizard — guided multi-step form for creating workflows
 * without requiring technical knowledge of Conductor.
 */
import React, { useState, useCallback } from 'react';
import type { WorkflowDef, TaskDef } from '../../types/conductor';

export interface WizardStepType {
    id: string;
    type: 'HUMAN' | 'HTTP' | 'EVENT' | 'SWITCH' | 'WAIT' | 'SUB_WORKFLOW' | 'SIMPLE';
    name: string;
    description: string;
    icon: string;
    businessLabel: string;
}

const STEP_TYPES: WizardStepType[] = [
    { id: 'human', type: 'HUMAN', name: '', description: '需要人工操作、审批或填写信息', icon: '👤', businessLabel: '人工审批' },
    { id: 'http', type: 'HTTP', name: '', description: '调用外部系统接口或服务', icon: '🌐', businessLabel: '调用服务' },
    { id: 'notify', type: 'EVENT', name: '', description: '发送通知（邮件/短信/消息）', icon: '📧', businessLabel: '发送通知' },
    { id: 'condition', type: 'SWITCH', name: '', description: '根据条件走不同的路径', icon: '🔀', businessLabel: '条件判断' },
    { id: 'wait', type: 'WAIT', name: '', description: '等待一段时间或某个事件', icon: '⏳', businessLabel: '等待' },
    { id: 'subprocess', type: 'SUB_WORKFLOW', name: '', description: '嵌套调用另一个已有流程', icon: '📦', businessLabel: '子流程' },
    { id: 'auto', type: 'SIMPLE', name: '', description: '系统自动处理的任务', icon: '⚙️', businessLabel: '自动任务' },
];

interface FormStep {
    id: string;
    stepType: WizardStepType;
    name: string;
    description: string;
    config: Record<string, string>;
}

interface WizardFormData {
    name: string;
    description: string;
    triggerType: 'manual' | 'scheduled' | 'event';
    steps: FormStep[];
}

interface WorkflowFormWizardProps {
    onComplete: (def: WorkflowDef) => void;
    onCancel: () => void;
    /** If provided, send a message to AI to help fill in config */
    onAskAi?: (prompt: string) => void;
}

const WIZARD_STAGES = [
    { id: 'basic', label: '基本信息', icon: '📋' },
    { id: 'steps', label: '流程步骤', icon: '📝' },
    { id: 'review', label: '预览确认', icon: '✅' },
];

function generateRef(name: string, index: number): string {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 20) || `step_${index + 1}`;
    return `${base}_${index + 1}`;
}

function formToWorkflowDef(data: WizardFormData): WorkflowDef {
    const tasks: TaskDef[] = data.steps.map((step, i) => {
        const ref = generateRef(step.name || step.stepType.businessLabel, i);
        const base: TaskDef = {
            name: step.name || step.stepType.businessLabel,
            taskReferenceName: ref,
            type: step.stepType.type,
            inputParameters: {},
        };
        if (step.stepType.type === 'SWITCH') {
            return {
                ...base,
                caseValueParam: 'case_value',
                decisionCases: { 'yes': [], 'no': [] },
                defaultCase: [],
            } as TaskDef;
        }
        if (step.stepType.type === 'HTTP') {
            return {
                ...base,
                inputParameters: { http_request: { uri: step.config.url || '', method: 'POST' } },
            };
        }
        return base;
    });

    return {
        name: data.name || '新工作流',
        description: data.description,
        version: 1,
        tasks,
        inputParameters: [],
        outputParameters: {},
        schemaVersion: 2,
    };
}

const WorkflowFormWizard: React.FC<WorkflowFormWizardProps> = ({ onComplete, onCancel, onAskAi }) => {
    const [stage, setStage] = useState(0);
    const [formData, setFormData] = useState<WizardFormData>({
        name: '',
        description: '',
        triggerType: 'manual',
        steps: [],
    });
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const updateBasic = useCallback((key: keyof WizardFormData, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    }, []);

    const addStep = useCallback((stepType: WizardStepType) => {
        setFormData(prev => ({
            ...prev,
            steps: [...prev.steps, {
                id: `step_${Date.now()}`,
                stepType,
                name: stepType.businessLabel,
                description: '',
                config: {},
            }],
        }));
    }, []);

    const removeStep = useCallback((id: string) => {
        setFormData(prev => ({ ...prev, steps: prev.steps.filter(s => s.id !== id) }));
    }, []);

    const updateStep = useCallback((id: string, updates: Partial<FormStep>) => {
        setFormData(prev => ({
            ...prev,
            steps: prev.steps.map(s => s.id === id ? { ...s, ...updates } : s),
        }));
    }, []);

    const moveStep = useCallback((from: number, to: number) => {
        setFormData(prev => {
            const steps = [...prev.steps];
            const [item] = steps.splice(from, 1);
            steps.splice(to, 0, item);
            return { ...prev, steps };
        });
    }, []);

    const validateStage = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (stage === 0) {
            if (!formData.name.trim()) newErrors.name = '请填写流程名称';
        }
        if (stage === 1) {
            if (formData.steps.length === 0) newErrors.steps = '请至少添加一个步骤';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const nextStage = () => {
        if (validateStage()) setStage(s => Math.min(s + 1, WIZARD_STAGES.length - 1));
    };

    const prevStage = () => setStage(s => Math.max(s - 1, 0));

    const handleComplete = () => {
        onComplete(formToWorkflowDef(formData));
    };

    return (
        <div className="wizard-overlay">
            <div className="wizard-dialog">
                {/* Header */}
                <div className="wizard-header">
                    <div className="wizard-title">✨ 创建新工作流</div>
                    <button className="wizard-close-btn" onClick={onCancel}>✕</button>
                </div>

                {/* Progress stepper */}
                <div className="wizard-stepper">
                    {WIZARD_STAGES.map((s, i) => (
                        <React.Fragment key={s.id}>
                            <div className={`wizard-step ${i === stage ? 'active' : ''} ${i < stage ? 'done' : ''}`}
                                 onClick={() => i < stage && setStage(i)}>
                                <div className="wizard-step-circle">
                                    {i < stage ? '✓' : <span>{s.icon}</span>}
                                </div>
                                <div className="wizard-step-label">{s.label}</div>
                            </div>
                            {i < WIZARD_STAGES.length - 1 && (
                                <div className={`wizard-step-connector ${i < stage ? 'done' : ''}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Stage content */}
                <div className="wizard-body">
                    {/* Stage 0: Basic Info */}
                    {stage === 0 && (
                        <div className="wizard-stage">
                            <div className="wizard-field">
                                <label className="wizard-label">流程名称 *</label>
                                <input
                                    className={`wizard-input ${errors.name ? 'error' : ''}`}
                                    placeholder="例如：员工入职审批流程"
                                    value={formData.name}
                                    onChange={e => updateBasic('name', e.target.value)}
                                />
                                {errors.name && <div className="wizard-error">{errors.name}</div>}
                            </div>
                            <div className="wizard-field">
                                <label className="wizard-label">流程说明</label>
                                <textarea
                                    className="wizard-textarea"
                                    placeholder="简述这个流程的业务目的和使用场景..."
                                    value={formData.description}
                                    onChange={e => updateBasic('description', e.target.value)}
                                    rows={3}
                                />
                            </div>
                            <div className="wizard-field">
                                <label className="wizard-label">触发方式</label>
                                <div className="wizard-trigger-options">
                                    {[
                                        { id: 'manual', icon: '👆', label: '手动触发', desc: '由用户主动发起' },
                                        { id: 'scheduled', icon: '⏰', label: '定时触发', desc: '按计划自动执行' },
                                        { id: 'event', icon: '📡', label: '事件触发', desc: '由系统事件驱动' },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            className={`wizard-trigger-option ${formData.triggerType === opt.id ? 'selected' : ''}`}
                                            onClick={() => updateBasic('triggerType', opt.id)}
                                        >
                                            <span className="wizard-trigger-icon">{opt.icon}</span>
                                            <span className="wizard-trigger-label">{opt.label}</span>
                                            <span className="wizard-trigger-desc">{opt.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {onAskAi && (
                                <button className="wizard-ai-hint" onClick={() => onAskAi(`帮我设计「${formData.name || '新流程'}」的工作流步骤`)}>
                                    💡 让 AI 帮我设计步骤
                                </button>
                            )}
                        </div>
                    )}

                    {/* Stage 1: Steps Builder */}
                    {stage === 1 && (
                        <div className="wizard-stage">
                            <div className="wizard-steps-area">
                                {/* Step type picker */}
                                <div className="wizard-step-picker">
                                    <div className="wizard-picker-label">添加步骤 →</div>
                                    <div className="wizard-picker-types">
                                        {STEP_TYPES.map(st => (
                                            <button key={st.id} className="wizard-type-btn" onClick={() => addStep(st)}>
                                                <span className="wizard-type-icon">{st.icon}</span>
                                                <span className="wizard-type-label">{st.businessLabel}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Step list */}
                                <div className="wizard-step-list">
                                    {errors.steps && <div className="wizard-error">{errors.steps}</div>}
                                    {formData.steps.length === 0 && (
                                        <div className="wizard-step-empty">
                                            <div>从左侧选择步骤类型开始构建您的流程</div>
                                        </div>
                                    )}
                                    {formData.steps.map((step, i) => (
                                        <div
                                            key={step.id}
                                            className={`wizard-step-item ${draggingIdx === i ? 'dragging' : ''} ${dragOverIdx === i ? 'drag-over' : ''}`}
                                            draggable
                                            onDragStart={() => setDraggingIdx(i)}
                                            onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                                            onDrop={() => {
                                                if (draggingIdx !== null && draggingIdx !== i) moveStep(draggingIdx, i);
                                                setDraggingIdx(null);
                                                setDragOverIdx(null);
                                            }}
                                            onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                                        >
                                            <div className="wizard-step-item-drag">⠿</div>
                                            <div className="wizard-step-item-icon">{step.stepType.icon}</div>
                                            <div className="wizard-step-item-content">
                                                <input
                                                    className="wizard-step-name-input"
                                                    value={step.name}
                                                    onChange={e => updateStep(step.id, { name: e.target.value })}
                                                    placeholder={step.stepType.businessLabel}
                                                />
                                                <div className="wizard-step-item-type">{step.stepType.businessLabel}</div>
                                            </div>
                                            <button className="wizard-step-remove" onClick={() => removeStep(step.id)}>✕</button>
                                        </div>
                                    ))}
                                    {/* Flow end indicator */}
                                    {formData.steps.length > 0 && (
                                        <div className="wizard-step-end">🏁 流程结束</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stage 2: Review */}
                    {stage === 2 && (
                        <div className="wizard-stage">
                            <div className="wizard-review">
                                <div className="wizard-review-header">
                                    <div className="wizard-review-name">{formData.name}</div>
                                    {formData.description && (
                                        <div className="wizard-review-desc">{formData.description}</div>
                                    )}
                                    <div className="wizard-review-meta">
                                        {formData.steps.length} 个步骤 · {
                                            formData.triggerType === 'manual' ? '手动触发' :
                                            formData.triggerType === 'scheduled' ? '定时触发' : '事件触发'
                                        }
                                    </div>
                                </div>
                                <div className="wizard-review-steps">
                                    {formData.steps.map((step, i) => (
                                        <div key={step.id} className="wizard-review-step">
                                            <div className="wizard-review-step-num" style={{ background: step.stepType.type === 'HUMAN' ? '#ec4899' : '#3b82f6' }}>
                                                {i + 1}
                                            </div>
                                            <div className="wizard-review-step-icon">{step.stepType.icon}</div>
                                            <div className="wizard-review-step-info">
                                                <div className="wizard-review-step-name">{step.name}</div>
                                                <div className="wizard-review-step-type">{step.stepType.description}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="wizard-footer">
                    <button className="wizard-btn secondary" onClick={stage === 0 ? onCancel : prevStage}>
                        {stage === 0 ? '取消' : '← 上一步'}
                    </button>
                    <div className="wizard-footer-progress">
                        {WIZARD_STAGES.map((_, i) => (
                            <div key={i} className={`wizard-progress-dot ${i === stage ? 'active' : ''} ${i < stage ? 'done' : ''}`} />
                        ))}
                    </div>
                    {stage < WIZARD_STAGES.length - 1 ? (
                        <button className="wizard-btn primary" onClick={nextStage}>
                            下一步 →
                        </button>
                    ) : (
                        <button className="wizard-btn primary" onClick={handleComplete}>
                            ✓ 创建工作流
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkflowFormWizard;
