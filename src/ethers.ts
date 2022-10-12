import DataLoader from "dataloader";
import { BaseContract, ethers } from "ethers";
import { FunctionFragment, Interface } from "ethers/lib/utils";
import _clone from "lodash/clone";

import { Multicall, Multicall__factory } from "./contracts";
import { MULTICALL_ADDRESSES } from "./registry";

export type ContractCall = {
  fragment: FunctionFragment;
  address: string;
  stack?: string;
  params: any[];
  overrides?: ethers.CallOverrides;
};

export type WithIndex<T> = T & { index: number };

export const isMulticallUnderlyingError = (err: Error) =>
  err.message.includes("Multicall call failed for");

const DEFAULT_DATALOADER_OPTIONS = { cache: true, maxBatchSize: 512 };

export interface EthersMulticallOptions {
  chainId: number;
  options: DataLoader.Options<ContractCall, any>;
}

export class EthersMulticall {
  private multicall: Multicall;
  private dataLoader: DataLoader<ContractCall, any>;

  constructor(
    provider: ethers.providers.Provider,
    { chainId = 1, options = DEFAULT_DATALOADER_OPTIONS }: Partial<EthersMulticallOptions> = {}
  ) {
    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) throw new Error(`Multicall not supported on chain with id "${chainId}"`);

    this.multicall = Multicall__factory.connect(multicallAddress, provider);
    this.dataLoader = new DataLoader(
      // @ts-ignore
      this.doCalls.bind(this),
      options
    );
  }

  static async new(
    provider: ethers.providers.Provider,
    options: DataLoader.Options<ContractCall, any> = DEFAULT_DATALOADER_OPTIONS
  ) {
    const network = await provider.getNetwork();

    return new EthersMulticall(provider, {
      chainId: network.chainId,
      options,
    });
  }

  get contract() {
    return this.multicall;
  }

  async setProvider(provider: ethers.providers.Provider, chainId?: number) {
    chainId ??= (await provider.getNetwork()).chainId;

    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) throw new Error(`Multicall not supported on chain with id "${chainId}"`);

    this.multicall = Multicall__factory.connect(multicallAddress, provider);
  }

  private async doCalls(allCalls: ContractCall[]) {
    const resolvedCalls = await Promise.all(
      allCalls.map(async (call, index) => ({
        ...call,
        index,
        blockTag: await call.overrides?.blockTag,
      }))
    );

    const blockTagCalls = resolvedCalls.reduce((acc, { blockTag = "latest", ...call }) => {
      blockTag = blockTag.toString();

      return {
        ...acc,
        [blockTag]: (acc[blockTag] ?? []).concat([call]),
      };
    }, {} as { [blockTag: ethers.providers.BlockTag]: WithIndex<ContractCall>[] });

    const results: any[] = [];
    await Promise.all(
      Object.values(blockTagCalls).map(async (calls) => {
        const callStructs = calls.map((call) => ({
          target: call.address,
          callData: new Interface([]).encodeFunctionData(call.fragment, call.params),
        }));
        const overrides = calls.map(({ overrides }) => overrides).find(Boolean);

        const res = overrides
          ? await this.multicall.callStatic.aggregate(callStructs, false, overrides)
          : await this.multicall.callStatic.aggregate(callStructs, false);

        if (res.returnData.length !== calls.length)
          throw new Error(
            `Unexpected multicall response length: received ${res.returnData.length}; expected ${calls.length}`
          );

        calls.forEach((call, i) => {
          const signature = FunctionFragment.from(call.fragment).format();
          const callIdentifier = [call.address, signature].join(":");
          const [success, data] = res.returnData[i];

          if (!success) {
            const error = new Error(`Multicall call failed for ${callIdentifier}`);
            error.stack = call.stack;

            return (results[call.index] = error);
          }

          try {
            const result = new Interface([]).decodeFunctionResult(call.fragment, data);

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
    const copy = Object.setPrototypeOf(_clone(contract), Object.getPrototypeOf(contract));
    copy.callStatic = _clone(contract.callStatic);
    copy.functions = _clone(contract.functions);

    (
      contract.interface.fragments.filter(
        (fragment) =>
          fragment.type === "function" &&
          ["pure", "view"].includes((fragment as FunctionFragment).stateMutability)
      ) as FunctionFragment[]
    ).forEach((fragment) => {
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
      Object.defineProperty(copy, fragment.name, descriptor);
      Object.defineProperty(copy.callStatic, fragment.name, descriptor);
      Object.defineProperty(copy.functions, fragment.name, descriptor);
    });

    return copy as T;
  }
}

export default EthersMulticall;
