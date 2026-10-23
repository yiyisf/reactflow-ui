import { useCallback, useEffect, useState } from 'react';
import type { OnboardingContext, OnboardingProvider, ProductInfo } from '../../providers/types';
import { isAbortError } from '../../onboarding/poll';

export interface OnboardingData {
  status: 'idle' | 'loading' | 'ready' | 'error';
  context: OnboardingContext | null;
  domains: string[];
  products: ProductInfo[];
  error: string | null;
  /** 重新加载（失败后重试） */
  reload: () => void;
  /** 新登记产品后本地追加，避免再请求一次 */
  addProduct: (p: ProductInfo) => void;
}

/**
 * 按 provider 实例加载一次：上下文、业务域、我的产品。
 * provider 引用变化时重新加载；卸载或切换时中止进行中的请求。没有 provider 时保持 idle。
 */
export function useOnboardingData(provider: OnboardingProvider | undefined): OnboardingData {
  const [state, setState] = useState<Omit<OnboardingData, 'reload' | 'addProduct'>>({
    status: 'idle',
    context: null,
    domains: [],
    products: [],
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!provider) {
      setState({ status: 'idle', context: null, domains: [], products: [], error: null });
      return;
    }
    const ac = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    Promise.all([
      provider.getContext(ac.signal),
      provider.listDomains(ac.signal),
      provider.listMyProducts(ac.signal),
    ]).then(
      ([context, domains, products]) => {
        if (ac.signal.aborted) return;
        setState({ status: 'ready', context, domains, products, error: null });
      },
      (e: unknown) => {
        if (ac.signal.aborted || isAbortError(e)) return;
        setState((s) => ({ ...s, status: 'error', error: e instanceof Error && e.message ? e.message : '加载自助接入信息失败' }));
      },
    );
    return () => ac.abort();
  }, [provider, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const addProduct = useCallback((p: ProductInfo) => {
    setState((s) => (s.products.some((x) => x.name === p.name) ? s : { ...s, products: [...s.products, p] }));
  }, []);

  return { ...state, reload, addProduct };
}
