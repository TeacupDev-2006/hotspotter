/** 阿里云云助手远程执行（绕过 workbench CLI 的 Windows bug）
 *  用法：ALIYUN_AK_ID=xxx ALIYUN_AK_SECRET=yyy node server/tests/aliyun-exec.mjs "命令"
 */
import Ecs, * as $Ecs from '@alicloud/ecs20140526';
import OpenApi from '@alicloud/openapi-client';

const AK_ID = process.env.ALIYUN_AK_ID;
const AK_SECRET = process.env.ALIYUN_AK_SECRET;
const INSTANCE = process.env.ALIYUN_INSTANCE || 'i-bp1i59hl8vkrx9x729us';
const REGION = process.env.ALIYUN_REGION || 'cn-hangzhou';
const script = process.argv[2];

if (!AK_ID || !AK_SECRET || !script) {
  console.error('需要 ALIYUN_AK_ID/ALIYUN_AK_SECRET 环境变量和命令参数');
  process.exit(1);
}

const config = new OpenApi.Config({ accessKeyId: AK_ID, accessKeySecret: AK_SECRET });
config.endpoint = `ecs.${REGION}.aliyuncs.com`;
const client = new Ecs.default(config);

// 1. 下发命令（SDK 自动处理编码，明文直传）
const run = await client.runCommand(
  new $Ecs.RunCommandRequest({
    regionId: REGION,
    type: 'RunShellScript',
    commandContent: script,
    instanceId: [INSTANCE],
    timeout: 300,
  })
);
console.log(`[invoke] ${run.body.invokeId}`);

// 2. 轮询结果
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await client.describeInvocationResults(
    new $Ecs.DescribeInvocationResultsRequest({ regionId: REGION, invokeId: run.body.invokeId })
  );
  const inv = res.body.invocation?.invocationResults?.invocationResult?.[0];
  if (inv && inv.finishedTime) {
    console.log(`[exit ${inv.exitCode}]\n─────── 输出 ───────`);
    console.log(inv.output ? Buffer.from(inv.output, 'base64').toString('utf8') : '(无输出)');
    process.exit(inv.exitCode ?? 0);
  }
}
console.error('超时：命令 5 分钟内未完成');
process.exit(1);
