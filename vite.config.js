import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 两个发布入口：
// - 默认（`vite build`）        → 主入口 src/index.ts（WorkflowIDE + 共享类型），产出 ES + UMD
// - `vite build --mode ai`      → AI 入口 src/ai.ts（AiWorkflowIDE），仅产出 ES
//   （UMD 需要单一全局变量、不支持真正的多 entry 代码分割，AI 场景不做 UMD 承诺）
export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo'
  const isAi = mode === 'ai'

  // Demo SPA 模式（用于独立站点与 Vercel / GitHub Pages 等平台托管部署）
  // 部署子路径通过环境变量 DEPLOY_BASE 指定：
  // - Vercel：不设置，默认 '/'
  // - GitHub Pages：DEPLOY_BASE=/reactflow-ui/（见 .github/workflows/deploy-pages.yml）
  if (isDemo) {
    return {
      base: process.env.DEPLOY_BASE || '/',
      plugins: [react()],
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            app: path.resolve(__dirname, 'app.html'),
          },
        },
      },
    }
  }

  // 库模式打包（供 npm 发布引用）
  return {
    plugins: [react()],
    build: {
      // 两次构建产出到同一个 dist/，第二次构建（ai）不应清空第一次的产物
      emptyOutDir: !isAi,
      lib: {
        entry: path.resolve(__dirname, isAi ? 'src/ai.ts' : 'src/index.ts'),
        name: isAi ? 'ReactflowUIAi' : 'ReactflowUI',
        formats: isAi ? ['es'] : ['es', 'umd'],
        fileName: (format) => isAi ? `reactflow-ui-ai.${format}.js` : `reactflow-ui.${format}.js`,
      },
      rollupOptions: {
        // 确保外部化处理那些你不想打包进库的依赖
        external: ['react', 'react-dom', 'reactflow'],
        output: {
          // 在 UMD 构建模式下为这些外部化的依赖提供一个全局变量
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            reactflow: 'ReactFlow'
          }
        }
      }
    }
  }
})
