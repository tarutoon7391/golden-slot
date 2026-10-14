/**
 * デバッグモードの判定
 * URL に `?debug=1` が付いているときだけデバッグパネルを出す。
 */
export function isDebugEnabled(search?: string): boolean {
  const q = search ?? (typeof location !== 'undefined' ? location.search : '');
  return new URLSearchParams(q).get('debug') === '1';
}
