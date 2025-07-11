# 测试 Diff 控制功能

## 修改内容

1. **默认设置更改**: 将 `experimental_includeDiff` 的默认值从 `true` 改为 `false`
   - 文件: `core/util/parameters.ts`
   - 这意味着默认情况下不会在 prompt 中包含 diff 内容

2. **添加调试日志**: 在 `CompletionProvider.ts` 中添加了选项状态的日志输出
   - 可以在控制台看到当前的 diff 包含选项状态

3. **添加过滤日志**: 在 `filtering.ts` 中添加了 diff snippets 数量和选项的日志输出

## 如何控制 diff 包含

你可以通过配置文件控制是否包含 diff：

```json
{
  "tabAutocompleteOptions": {
    "experimental_includeDiff": false  // 设为 false 禁用，true 启用
  }
}
```

或者设置优先级（数字越小优先级越高）：

```json
{
  "tabAutocompleteOptions": {
    "experimental_includeDiff": 1  // 设置为数字表示优先级
  }
}
```

## 验证方式

1. 启动扩展
2. 查看控制台输出中的日志：
   - `CompletionProvider: Options:` - 显示当前选项状态
   - `getSnippets: Include diff option:` - 显示是否包含 diff
   - `getSnippets: Diff snippets count:` - 显示 diff snippets 数量

3. 当 `experimental_includeDiff` 为 `false` 时，diff 内容不会被包含在 prompt 中
