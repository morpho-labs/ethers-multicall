import { ethers } from "ethers";

import { EthersMulticall, MULTICALL_ADDRESSES } from "../src";

import MorphoAbi from "./abis/Morpho.json";
import UniswapAbi from "./abis/Uni.json";

const httpRpcUrl = "https://rpc.ankr.com/eth";
const rpcProvider = new ethers.providers.JsonRpcProvider(httpRpcUrl, 1);

const _morpho = new ethers.Contract("0x8888882f8f843896699869179fB6E4f7e3B58888", MorphoAbi);
const _uni = new ethers.Contract("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", UniswapAbi);

describe("index", () => {
  describe("Providers integration", () => {
    it("should work given a JsonRpcProvider", async () => {
      const multicall = new EthersMulticall(rpcProvider);

      expect(multicall.contract.provider).toBe(rpcProvider);
      expect(multicall.contract.address).toBe(MULTICALL_ADDRESSES[1]);

      const wrappedMorpho = multicall.wrap(_morpho);

      expect(wrappedMorpho.address).toBe(_morpho.address);
      expect(await wrappedMorpho.cEth()).toBe("0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5");
    });

    it("should work given a JsonRpcBatchProvider", async () => {
      const rpcBatchProvider = new ethers.providers.JsonRpcBatchProvider(httpRpcUrl, 1);
      const multicall = new EthersMulticall(rpcBatchProvider);

      expect(multicall.contract.provider).toBe(rpcBatchProvider);
      expect(multicall.contract.address).toBe(MULTICALL_ADDRESSES[1]);

      const wrappedMorpho = multicall.wrap(_morpho);

      expect(wrappedMorpho.address).toBe(_morpho.address);
      expect(await wrappedMorpho.cEth()).toBe("0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5");
    });
  });

  describe("Calls batching", () => {
    it("should batch UNI calls", async () => {
      const multicall = new EthersMulticall(rpcProvider);
      const wrappedUni = multicall.wrap(_uni);

      const send = rpcProvider.send.bind(rpcProvider);

      jest
        .spyOn(rpcProvider, "send")
        .mockImplementation(async (method, ...args) => send(method, ...args));

      await Promise.all([wrappedUni.name(), wrappedUni.symbol(), wrappedUni.decimals()]);

      expect(rpcProvider.send).toBeCalledTimes(2);
      expect(rpcProvider.send).toBeCalledWith("eth_chainId", []);
      expect(rpcProvider.send).toBeCalledWith("eth_call", [
        {
          data: "0x17352e13000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001600000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000406fdde03000000000000000000000000000000000000000000000000000000000000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f9840000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000495d89b41000000000000000000000000000000000000000000000000000000000000000000000000000000001f9840a85d5af5bf1d1762f925bdaddc4201f98400000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000004313ce56700000000000000000000000000000000000000000000000000000000",
          to: "0x5eb3fa2dfecdde21c950813c665e9364fa609bd2",
        },
        "latest",
      ]);
    });
  });
});
