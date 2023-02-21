import DataLoader from "dataloader";
import { BaseContract, CallOverrides } from "ethers";
import { FunctionFragment, Interface, resolveProperties } from "ethers/lib/utils";

import { BlockTag, Provider } from "@ethersproject/providers";

import { Multicall3, Multicall3__factory } from "./contracts";

export type ContractCall = {
  fragment: FunctionFragment;
  address: string;
  params: any[];
  overrides?: CallOverrides;
};

export const isMulticallUnderlyingError = (err: Error) =>
  err.message.includes("Multicall call failed for");

const DIGIT_REGEX = /^\d+$/;
const DEFAULT_DATALOADER_OPTIONS = {};

export interface EthersMulticallOptions {
  chainId: number;
  defaultBlockTag: BlockTag;
  options: DataLoader.Options<ContractCall, any>;
}

export type MulticallResult = Multicall3.ResultStructOutput | { error: any };

export class EthersMulticall {
  private multicall: Multicall3;
  private dataLoader: DataLoader<ContractCall, MulticallResult>;

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
    this.dataLoader = new DataLoader(this.doCalls.bind(this), options);

    this.defaultBlockTag = defaultBlockTag;
  }

  get contract() {
    return this.multicall;
  }

  async setProvider(provider: Provider, chainId?: number) {
    chainId ??= (await provider.getNetwork()).chainId;

    this.multicall = Multicall3__factory.connect(this.multicall.address, provider);
  }

  private async doCalls(allCalls: ReadonlyArray<ContractCall>) {
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

    const results: MulticallResult[] = [];

    await Promise.all(
      Object.entries(blockTagCalls).map(async ([blockTagStr, calls]) => {
        const callStructs = calls.map((call) => ({
          target: call.address,
          callData: new Interface([]).encodeFunctionData(call.fragment, call.params),
        }));
        const overrides = calls.map(({ overrides }) => overrides).find(Boolean);
        const blockTag = DIGIT_REGEX.test(blockTagStr) ? parseInt(blockTagStr, 10) : blockTagStr;

        try {
          const res = await this.multicall.callStatic.tryAggregate(false, callStructs, {
            ...overrides,
            blockTag,
          });

          if (res.length !== calls.length)
            throw new Error(
              `Unexpected multicall response length: received ${res.length}; expected ${calls.length}`
            );

          calls.forEach((call, i) => {
            results[call.index] = res[i];
          });
        } catch (error: any) {
          calls.forEach((call) => {
            results[call.index] = { error };
          });
        }
      })
    );

    return results;
  }

  wrap<T extends BaseContract>(contract: T) {
    const copy = Object.setPrototypeOf({ ...contract }, Object.getPrototypeOf(contract));
    copy.callStatic = { ...contract.callStatic };
    copy.functions = { ...contract.functions };

    const defineFunction = (property: string, fragment: FunctionFragment) => {
      const descriptor = {
        configurable: true,
        enumerable: true,
        writable: false,
        value: async (...params: any) => {
          const res = await this.dataLoader.load({
            fragment,
            address: contract.address,
            params: params.slice(0, fragment.inputs.length),
            overrides: params[fragment.inputs.length],
          });

          if ("error" in res) throw res.error;

          const signature = FunctionFragment.from(fragment).format();
          const callIdentifier = [contract.address, signature].join(":");

          if (!res.success) throw Error(`${callIdentifier} call revert exception`);
          if (res.returnData === "0x") throw Error(`${callIdentifier} empty return data exception`);

          try {
            const result = new Interface([]).decodeFunctionResult(fragment, res.returnData);

            return fragment.outputs?.length === 1 ? result[0] : result;
          } catch (err: any) {
            throw new Error(`Multicall decoding failed for ${callIdentifier}: ${err.message}`);
          }
        },
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
