/** curl 样例（虚构地址与占位凭据）。 */

/** 多行续行 + 多个 -H + -d JSON + Bearer（敏感） */
export const CURL_CREATE_TICKET = `curl -X POST 'https://itsm.example.com/api/tickets?notify=true' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer sample-token-123' \\
  -H "X-Request-Id: req-1" \\
  -d '{"title":"磁盘告警","priority":"high","retry":3,"watchers":["a@example.com"],"meta":{"source":"monitor"}}'`;

/** --data-raw + 不写 -X（应推断为 POST）+ 浏览器风格 $'…' 引号 */
export const CURL_CHROME_STYLE = `curl 'https://cmdb.example.com/api/v1/assets' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'content-type: application/json' \\
  -H 'cookie: sid=abc; theme=dark' \\
  --data-raw $'{"name":"web-03","owner":"o\\'neil@example.com"}' \\
  --compressed`;

/** -u 基本认证 + GET + 查询参数含 token */
export const CURL_BASIC_GET = `curl -u admin:sample-password "https://monitor.example.com/api/metrics?name=cpu&access_token=sample-abc&limit=10"`;

/** --request / --header 长选项、--url、-XDELETE 紧贴写法 */
export const CURL_LONG_FLAGS = `curl --request PUT --url https://cmdb.example.com/api/v1/assets/ast-001 --header 'Content-Type: application/json' --header 'X-Api-Key: sample' --data '{"owner":"zhang@example.com"}' -sS -L`;

/** 表单体（x-www-form-urlencoded）里含 password */
export const CURL_FORM = `curl https://auth.example.com/login -d 'username=alice&password=sample-pass&remember=1'`;
