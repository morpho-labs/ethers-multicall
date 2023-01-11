import DataLoader from "dataloader";
import { BaseContract, CallOverrides } from "ethers";
import { FunctionFragment, Interface, resolveProperties } from "ethers/lib/utils";
import _cloneDeep from "lodash/cloneDeep";

import { BlockTag, Provider } from "@ethersproject/providers";

import { Multicall3, Multicall3__factory } from "./contracts";

export type ContractCall = {
  fragment: FunctionFragment;
  address: string;
  stack?: string;
  params: any[];
  overrides?: CallOverrides;
};

export const isMulticallUnderlyingError = (err: Error) =>
  err.message.includes("Multicall call failed for");

const DIGIT_REGEX = /^\d+$/;
const DEFAULT_DATALOADER_OPTIONS = { cache: true, maxBatchSize: 512 };

export interface EthersMulticallOptions {
  chainId: number;
  defaultBlockTag: BlockTag;
  options: DataLoader.Options<ContractCall, any>;
}

export class EthersMulticall {
  private multicall: Multicall3;
  private dataLoader: DataLoader<ContractCall, any>;

  public defaultBlockTag: BlockTag;

  constructor(
    provider: Provider,
    {
      defaultBlockTag = "latest",
      options = DEFAULT_DATALOADER_OPTIONS,
    }: Partial<EthersMulticallOptions> = {}
  ) {
    this.multicall = Multicall3__factory.connect(
      // same address on all networks (cf. https://github.com/mds1/multicall#deployments)
      "0xcA11bde05977b3631167028862bE2a173976CA11",
      provider
    );
    this.dataLoader = new DataLoader(
      // @ts-ignore
      this.doCalls.bind(this),
      options
    );

    this.defaultBlockTag = defaultBlockTag;
  }

  get contract() {
    return this.multicall;
  }

  async setProvider(provider: Provider, chainId?: number) {
    chainId ??= (await provider.getNetwork()).chainId;

    this.multicall = Multicall3__factory.connect(this.multicall.address, provider);
  }

  private async doCalls(allCalls: ContractCall[]) {
    const resolvedCalls = await Promise.all(
      allCalls.map(async (call, index) => ({
        ...call,
        index,
        overrides: call.overrides ? await resolveProperties(call.overrides) : undefined,
      }))
    );

    const blockTagCalls = resolvedCalls.reduce((acc, call) => {
      const blockTag = (call.overrides?.blockTag ?? this.defaultBlockTag).toString();

      return {
        ...acc,
        [blockTag]: [call].concat(acc[blockTag] ?? []),
      };
    }, {} as { [blockTag: BlockTag]: typeof resolvedCalls });

    const results: any[] = [];
    await Promise.all(
      Object.entries(blockTagCalls).map(async ([blockTagStr, calls]) => {
        const callStructs = calls.map((call) => ({
          target: call.address,
          callData: new Interface([]).encodeFunctionData(call.fragment, call.params),
        }));
        const overrides = calls.map(({ overrides }) => overrides).find(Boolean);
        const blockTag = DIGIT_REGEX.test(blockTagStr) ? parseInt(blockTagStr, 10) : blockTagStr;

        const res = await this.multicall.callStatic
          .aggregate(callStructs, { ...overrides, blockTag })
          .catch(async (error) => {
            if (
              error.code === "CALL_EXCEPTION" &&
              error.data === "0x" &&
              error.reason == null &&
              error.errorName == null &&
              error.errorArgs == null
            )
              return {
                blockNumber: blockTag,
                returnData: await Promise.all(
                  callStructs.map(async (call) =>
                    this.multicall.provider.call(
                      {
                        ...overrides,
                        to: call.target,
                        data: call.callData,
                      },
                      blockTag
                    )
                  )
                ),
              };

            throw error;
          });

        if (res.returnData.length !== calls.length)
          throw new Error(
            `Unexpected multicall response length: received ${res.returnData.length}; expected ${calls.length}`
          );

        calls.forEach((call, i) => {
          const signature = FunctionFragment.from(call.fragment).format();
          const callIdentifier = [call.address, signature].join(":");

          try {
            const result = new Interface([]).decodeFunctionResult(call.fragment, res.returnData[i]);

            return (results[call.index] = call.fragment.outputs!.length === 1 ? result[0] : result);
          } catch (err: any) {
            const error = new Error(
              `Multicall result decoding failed for ${callIdentifier}: ${err.message}`
            );
            error.name = error.message;
            error.stack = call.stack;

            throw error;
          }
        });
      })
    );

    return results;
  }

  wrap<T extends BaseContract>(contract: T) {
    const copy = Object.setPrototypeOf(_cloneDeep(contract), Object.getPrototypeOf(contract));
    copy.callStatic = _cloneDeep(contract.callStatic);
    copy.functions = _cloneDeep(contract.functions);

    const defineFunction = (property: string, fragment: FunctionFragment) => {
      const descriptor = {
        enumerable: true,
        writable: false,
        value: (...params: any) =>
          this.dataLoader.load({
            fragment,
            address: contract.address,
            stack: new Error().stack?.split("\n").slice(1).join("\n"),
            params: params.slice(0, fragment.inputs.length),
            overrides: params[fragment.inputs.length],
          }),
      };

      // Overwrite the function with a dataloader batched call
      Object.defineProperty(copy, property, descriptor);
      Object.defineProperty(copy.callStatic, property, descriptor);
      Object.defineProperty(copy.functions, property, descriptor);
    };

    const uniqueNames: { [name: string]: FunctionFragment[] } = {};

    Object.entries(contract.interface.functions).forEach(([signature, fragment]) => {
      if (!["view", "pure"].includes(fragment.stateMutability)) return;

      if (!uniqueNames[`%${fragment.name}`]) uniqueNames[`%${fragment.name}`] = [];
      uniqueNames[`%${fragment.name}`].push(fragment);

      defineFunction(signature, fragment);
    });

    Object.entries(uniqueNames).forEach(([name, fragments]) => {
      // Ambiguous names to not get attached as bare names
      if (fragments.length > 1) return;

      // Strip off the leading "%" used for prototype protection
      defineFunction(name.substring(1), fragments[0]);
    });

    return copy as T;
  }
}

export default EthersMulticall;
