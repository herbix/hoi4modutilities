# 目录要求
* 源代码：主要代码放在`src`目录下。webview里的代码放在`webviewsrc`目录下。本地化资源放在`i18n`目录下。
* 测试代码：`src`下代码的测试放在`test/suite`，`webviewsrc`下代码的测试放在`test/webviewsuite`，目录结构与被测试文件保持对应。
* 生成文件：`out`, `dist`, `prod`, `static`等目录是生成的，不要手动修改。

# 代码要求
## 1
以代码简洁优先。不要为了方便写测试，而做不必要的抽象，或者把成员函数改成公有的。优先测试公开行为；确实无法自动测试时，说明原因并提供手动测试步骤。

```typescript
import { Handler } from './handler';
export function foo(input: string) { // ✅ 不需要和调用者共享Handler的话，直接创建并使用Handler
    const handler = new Handler(input);
    return handler.handle() + 'foo';
}
```

❌ 不要做不必要的抽象。
```typescript
import { Handler } from './handler';
export function foo(input: string, handler: Handler) {  // ❌ 不要把Handler作为参数传入
    return handler.handle() + 'foo';
}
```

可以在测试时使用Sinon Stub Handler类，或者直接把Handler类也纳入测试。
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Handler } from './handler';
import { foo } from './foo';

suite('foo', () => {
    teardown(() => sinon.restore());
    test('returns the handled result', () => {
        sinon.stub(Handler.prototype, 'handle').returns('handled');
        assert.strictEqual(foo('test'), 'handledfoo');
    });
});
```

## 2
如果函数参数或者返回类型已经非空，不做多余的空检查，也不加`!`，直接使用类型即可。

```typescript
function foo(x: string) { // x已经是非空类型
    console.log(x!.length); // ❌ 不要加 `!`
    console.log(x?.length); // ❌ 不要加 `?`
    console.log(x !== undefined ? x.length : 0); // ❌ 不要加三元运算符
    if (x !== undefined) {
        console.log(x.length); // ❌ 不要加 if 判断
    }
    console.log(x.length);  // ✅ 直接使用类型
}
```

# 测试要求
完成代码后，运行以下命令进行测试：
```sh
npm run test
```
在Windows下，直接用：
```sh
npm.cmd run test
```
因为要下载和运行VS Code，需要在沙箱外运行，并移除`ELECTRON_RUN_AS_NODE=1`环境变量。

# 可忽略的警告
```
WARNING in ./node_modules/@vscode/extension-telemetry/lib/telemetryReporter.node.min.js 8:14890-14935
Module not found: Error: Can't resolve 'applicationinsights-native-metrics' in '.node_modules\@vscode\extension-telemetry\lib'
```
仅在测试最终退出码为 0 时可忽略，不能因此忽略真正的构建或测试失败。
