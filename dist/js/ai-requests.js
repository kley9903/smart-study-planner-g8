// AI 請求的生命週期：同一類一次一個；更換計劃後，舊回應與舊錯誤都不再生效。
// reset 會盡量取消網絡工作；即使 fetch 不理會取消，仍會檢查請求是否屬於目前這次。
export function createAiRequests({ fetcher = (...args) => fetch(...args) } = {}) {
  const active = new Map();
  return {
    async send(kind, body, apply) {
      if (active.has(kind)) return;
      const controller = new AbortController();
      active.set(kind, controller);
      let out;
      try {
        const res = await fetcher(`/api/${kind}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: controller.signal,
        });
        out = await res.json();
      } catch {
        out = { ok: false, reason: 'network' };
      }
      // reset 後可能已有同類的新請求；舊請求不能清掉它，也不能套用結果。
      if (active.get(kind) !== controller) return;
      active.delete(kind);
      // 檢查和套用在同一個同步步驟，避免再跨一次 await 才改 state。
      return apply(out);
    },
    reset() {
      const controllers = [...active.values()];
      active.clear();
      controllers.forEach((controller) => controller.abort());
    },
  };
}
