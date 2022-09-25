import * as dotenv from "dotenv";
import { ethers } from "ethers";

import { EthersMulticall, MULTICALL_ADDRESSES } from "../src";

import MorphoAbi from "./abis/Morpho.json";
import UniswapAbi from "./abis/Uni.json";

dotenv.config({ path: ".env.local" });

const httpRpcUrl = process.env.HTTP_RPC_URL || "https://rpc.ankr.com/eth";

let rpcProvider: ethers.providers.JsonRpcProvider;
let signer: ethers.Signer;

let _morpho: ethers.Contract;
let _uni: ethers.Contract;

describe("ethers-multicall", () => {
  beforeEach(() => {
    rpcProvider = new ethers.providers.JsonRpcProvider(httpRpcUrl, 1);
    signer = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, rpcProvider);

    _morpho = new ethers.Contract("0x8888882f8f843896699869179fB6E4f7e3B58888", MorphoAbi, signer);
    _uni = new ethers.Contract("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", UniswapAbi, signer);
  });

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
    it("should batch UNI calls inside Promise.all", async () => {
      const multicall = new EthersMulticall(rpcProvider);
      const wrappedUni = multicall.wrap(_uni);

      const send = rpcProvider.send.bind(rpcProvider);

      jest
        .spyOn(rpcProvider, "send")
        .mockImplementation(async (method, ...args) => send(method, ...args));

      await Promise.all([wrappedUni.name(), wrappedUni.symbol(), wrappedUni.decimals()]).then(
        ([name, symbol, decimals]: [string, string, ethers.BigNumber]) => {
          expect(name).toBe("Uniswap");
          expect(symbol).toBe("UNI");
          expect(decimals.toString()).toBe("18");
        }
      );

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

    it("should batch UNI calls without Promise.all", async () => {
      const multicall = new EthersMulticall(rpcProvider);
      const wrappedUni = multicall.wrap(_uni);

      const send = rpcProvider.send.bind(rpcProvider);

      jest
        .spyOn(rpcProvider, "send")
        .mockImplementation(async (method, ...args) => send(method, ...args));

      wrappedUni.name().then((name: string) => expect(name).toBe("Uniswap"));
      wrappedUni.symbol().then((symbol: string) => expect(symbol).toBe("UNI"));
      await wrappedUni
        .decimals()
        .then((decimals: ethers.BigNumber) => expect(decimals.toString()).toBe("18"));

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

    it("should fetch UNI.balanceOf(cUNI) at block 14000000", async () => {
      const multicall = new EthersMulticall(rpcProvider, {
        overrides: {
          blockTag: 14000000,
        },
      });
      const wrappedUni = multicall.wrap(_uni);

      const balance = await wrappedUni.balanceOf("0x35A18000230DA775CAc24873d00Ff85BccdeD550");

      expect(balance.toString()).toEqual("9043006006625928002643013");
    });

    it("should fetch UNI.totalSupply at block 14000000", async () => {
      const rpcProvider2 = new ethers.providers.JsonRpcProvider(httpRpcUrl, 1);

      const multicall = new EthersMulticall(rpcProvider, {
        overrides: {
          blockTag: 14000000,
        },
      });
      const wrappedUni = multicall.wrap(_uni);

      const send = rpcProvider.send.bind(rpcProvider);
      const send2 = rpcProvider2.send.bind(rpcProvider2);

      jest
        .spyOn(rpcProvider, "send")
        .mockImplementation(async (method, ...args) => send(method, ...args));
      jest
        .spyOn(rpcProvider2, "send")
        .mockImplementation(async (method, ...args) => send2(method, ...args));

      const totalSupplyBefore = await wrappedUni.totalSupply();

      expect(rpcProvider.send).toBeCalledTimes(2);

      await multicall.setProvider(rpcProvider2, 1);
      const totalSupplyAfter = await wrappedUni.totalSupply();

      expect(rpcProvider2.send).toBeCalledTimes(2);

      expect(totalSupplyBefore.toString()).toEqual(totalSupplyAfter.toString());
    });

    it("should throw a descriptive Error when querying unknown contract", async () => {
      const multicall = new EthersMulticall(rpcProvider);
      const wrappedUnknown = multicall.wrap(
        new ethers.Contract("0xd6409e50c05879c5B9E091EB01E9Dd776d00A151", UniswapAbi)
      );

      expect(wrappedUnknown.symbol).rejects.toThrow(
        new Error(
          `Multicall call failed for 0xd6409e50c05879c5B9E091EB01E9Dd776d00A151:symbol(): call revert exception [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ] (method="symbol()", data="0x", errorArgs=null, errorName=null, errorSignature=null, reason=null, code=CALL_EXCEPTION, version=abi/5.7.0)`
        )
      );
    });
  });
});
