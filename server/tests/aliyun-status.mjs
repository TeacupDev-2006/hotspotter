import Ecs, * as $Ecs from '@alicloud/ecs20140526';
import OpenApi from '@alicloud/openapi-client';
const config = new OpenApi.Config({ accessKeyId: process.env.ALIYUN_AK_ID, accessKeySecret: process.env.ALIYUN_AK_SECRET });
config.endpoint = 'ecs.cn-hangzhou.aliyuncs.com';
const client = new Ecs.default(config);

// 方式1：明文直传
const run = await client.runCommand(new $Ecs.RunCommandRequest({
  regionId: 'cn-hangzhou', type: 'RunShellScript',
  commandContent: 'echo HELLO-PLAIN && hostname',
  instanceId: ['i-bp1i59hl8vkrx9x729us'], timeout: 60,
}));
console.log('invokeId:', run.body.invokeId);
await new Promise(r => setTimeout(r, 5000));
const res = await client.describeInvocationResults(new $Ecs.DescribeInvocationResultsRequest({ regionId: 'cn-hangzhou', invokeId: run.body.invokeId }));
const inv = res.body.invocation?.invocationResults?.invocationResult?.[0];
console.log('status:', inv?.invocationStatus, 'exit:', inv?.exitCode);
console.log('output(raw):', JSON.stringify(inv?.output));
if (inv?.output) {
  try { console.log('解码:', Buffer.from(inv.output, 'base64').toString()); } catch {}
}
