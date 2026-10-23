/**
 * 接口导入：解析结果的公共类型（纯数据，无 React 依赖）。
 * 设计见 docs/design/v1.3.0-自助接入设计.md 第 4 节。
 */

/** 可导入的来源格式 */
export type ImportFormat = 'openapi3' | 'swagger2' | 'postman21' | 'curl';

/** detectFormat 的结果：除可导入格式外，还可能是 YAML（不支持）或无法识别 */
export type DetectedFormat = ImportFormat | 'yaml' | 'unknown';

/** JSON Schema 片段（已解析本地 $ref，保持宽松类型） */
export type JsonSchema = Record<string, any>;

export type ParamLocation = 'path' | 'query' | 'header';

export interface ImportedParam {
    name: string;
    in: ParamLocation;
    required: boolean;
    schema: JsonSchema;
    description?: string;
    /** 导入时带入的默认值（curl / Postman 中的字面量；敏感名称已替换为占位） */
    defaultValue?: string;
}

export interface ImportedBody {
    /** 例如 application/json */
    contentType: string;
    /** object 且含 properties 时拆成多个字段；否则整体作为单个 `body` 字段 */
    schema: JsonSchema;
}

export interface ImportedOperation {
    /** 同一次解析内唯一，形如 `get_tickets_id`，用于动作 id（`import.<id>`） */
    id: string;
    /** 大写 HTTP 方法 */
    method: string;
    /** 服务地址（不含路径），可能为空或含 `${workflow.input.xxx}` */
    baseUrl: string;
    /** 路径模板，路径参数写作 `{id}` */
    path: string;
    summary?: string;
    description?: string;
    operationId?: string;
    tags: string[];
    params: ImportedParam[];
    /** 固定请求头（敏感头的值已替换为 `${workflow.input.xxx}` 占位） */
    headers: Record<string, string>;
    body?: ImportedBody;
    /** 2xx 响应的 JSON Schema */
    responseSchema?: JsonSchema;
    /** 与该接口相关的提示（敏感头替换、不支持的部分等） */
    warnings: string[];
}

export type ParseResult =
    | {
          ok: true;
          format: ImportFormat;
          operations: ImportedOperation[];
          /** 汇总提示（含各接口的提示，已带接口前缀） */
          warnings: string[];
      }
    | {
          ok: false;
          format?: DetectedFormat;
          /** 面向用户的中文错误信息 */
          error: string;
      };

/** 提示用户把 YAML 转成 JSON 的固定文案 */
export const YAML_HINT = 'YAML 请先转为 JSON 后再导入';
