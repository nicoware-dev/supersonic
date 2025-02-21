//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/IDeBridgeGate.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/IDeBridgeGateExtended.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/ICallProxy.sol";

import "./interfaces/ICrossChainCounter.sol";

contract CrossChainCounter is AccessControl, ICrossChainCounter {
    /// @dev DeBridgeGate's address on the current chain
    IDeBridgeGateExtended public deBridgeGate;

    /// @dev chains, where commands are allowed to come from
    /// @dev chain_id_from => ChainInfo
    mapping(uint256 => ChainInfo) supportedChains;

    uint256 public counter;

    /* ========== MODIFIERS ========== */

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert AdminBadRole();
        _;
    }

    /// @dev Restricts calls made by deBridge's CallProxy
    ///         AND that are originating from the whitelisted CrossChainCounter address on the origin chain
    modifier onlyCrossChainIncrementor() {
        ICallProxy callProxy = ICallProxy(deBridgeGate.callProxy());

        // caller is CallProxy?
        if (address(callProxy) != msg.sender) {
            revert CallProxyBadRole();
        }

        uint256 chainIdFrom = callProxy.submissionChainIdFrom();

        if (supportedChains[chainIdFrom].callerAddress.length == 0) {
            revert ChainNotSupported(chainIdFrom);
        }

        // has the transaction being initiated by the whitelisted CrossChainIncrementor on the origin chain?
        bytes memory nativeSender = callProxy.submissionNativeSender();
        if (
            keccak256(supportedChains[chainIdFrom].callerAddress) !=
            keccak256(nativeSender)
        ) {
            revert NativeSenderBadRole(nativeSender, chainIdFrom);
        }

        _;
    }

    /* ========== INITIALIZERS ========== */

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /* ========== MAINTENANCE METHODS ========== */

    function setDeBridgeGate(IDeBridgeGateExtended deBridgeGate_)
        external
        onlyAdmin
    {
        deBridgeGate = deBridgeGate_;
    }

    function addChainSupport(
        uint256 _chainId,
        bytes memory _crossChainIncrementorAddress
    ) external onlyAdmin {
        supportedChains[_chainId].callerAddress = _crossChainIncrementorAddress;
        supportedChains[_chainId].isSupported = true;

        emit SupportedChainAdded(_chainId, _crossChainIncrementorAddress);
    }

    function removeChainSupport(uint256 _chainId) external onlyAdmin {
        supportedChains[_chainId].isSupported = false;
        emit SupportedChainRemoved(_chainId);
    }

    /* ========== PUBLIC METHODS: RECEIVING ========== */

    /// @inheritdoc ICrossChainCounter
    function receiveIncrementCommand(uint8 _amount, address _initiator)
        external
        override
        onlyCrossChainIncrementor
    {
        counter += _amount;

        uint256 chainIdFrom = ICallProxy(deBridgeGate.callProxy())
            .submissionChainIdFrom();
        emit CounterIncremented(counter, _amount, chainIdFrom, _initiator);
    }
}
