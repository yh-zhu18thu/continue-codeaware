

export async function setupRemoteConfigSync(reloadConfig: () => void) {
  // CodeAware: 禁用远程配置同步以避免网络请求
  console.log("[RemoteConfig] Remote config sync disabled in CodeAware mode");
  return;
}
