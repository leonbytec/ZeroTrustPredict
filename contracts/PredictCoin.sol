// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE} from "@fhevm/solidity/lib/FHE.sol";

contract PredictCoin is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("PCoin", "PCoin", "") {}

    function faucet() public {
        _mint(msg.sender, FHE.asEuint64(100*1000000));
    }
}
