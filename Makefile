-include .env.local
.EXPORT_ALL_VARIABLES:

FOUNDRY_SRC=contracts/
FOUNDRY_ETH_RPC_URL=${HTTP_RPC_URL}

deploy:
	forge create --private-key ${FOUNDRY_PRIVATE_KEY} --optimize contracts/Multicall.sol:Multicall --verify

.PHONY: deploy
