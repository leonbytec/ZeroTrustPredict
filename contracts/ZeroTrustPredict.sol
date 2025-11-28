// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint8, externalEuint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "confidential-contracts-v91/contracts/interfaces/IERC7984.sol";

/// @title ZeroTrustPredict - Confidential prediction market built on PredictCoin
/// @notice Users create encrypted predictions and place encrypted selections funded by PredictCoin stakes
contract ZeroTrustPredict is ZamaEthereumConfig {
    /// @notice Emitted when a new prediction is created
    event PredictionCreated(uint256 indexed predictionId, address indexed creator, string title);

    /// @notice Emitted whenever the active flag for a prediction changes
    event PredictionStatusChanged(uint256 indexed predictionId, bool isActive);

    /// @notice Emitted after an encrypted selection is accepted
    event EncryptedSelectionPlaced(uint256 indexed predictionId, address indexed bettor, euint64 encryptedStake);

    error InvalidPredictionId(uint256 predictionId);
    error InvalidOptionCount(uint256 supplied);
    error InactivePrediction(uint256 predictionId);
    error NotPredictionCreator(address caller);

    uint8 private constant MIN_OPTIONS = 2;
    uint8 private constant MAX_OPTIONS = 6;

    /// @notice Keeps the encrypted tally for a specific option
    struct OptionData {
        string label;
        euint64 encryptedSelections;
        euint64 encryptedStakeTotal;
    }

    /// @notice Core prediction data stored on-chain
    struct Prediction {
        string title;
        address creator;
        bool active;
        uint64 createdAt;
        euint64 encryptedTotalStake;
        OptionData[] options;
    }

    IERC7984 public immutable predictCoin;
    Prediction[] private _predictions;

    mapping(uint256 predictionId => mapping(address user => euint64)) private _userStakes;
    mapping(uint256 predictionId => mapping(address user => euint8)) private _userChoices;

    constructor(address predictCoinAddress) {
        require(predictCoinAddress != address(0), "PredictCoin required");
        predictCoin = IERC7984(predictCoinAddress);
    }

    /// @notice Creates a new prediction with between two and six options
    function createPrediction(string calldata title, string[] calldata optionLabels) external returns (uint256) {
        uint256 optionsLength = optionLabels.length;
        if (optionsLength < MIN_OPTIONS || optionsLength > MAX_OPTIONS) {
            revert InvalidOptionCount(optionsLength);
        }
        require(bytes(title).length > 0, "Title required");

        Prediction storage prediction = _predictions.push();
        prediction.title = title;
        prediction.creator = msg.sender;
        prediction.active = true;
        prediction.createdAt = uint64(block.timestamp);
        prediction.encryptedTotalStake = FHE.asEuint64(0);
        FHE.allowThis(prediction.encryptedTotalStake);

        for (uint256 i = 0; i < optionsLength; i++) {
            require(bytes(optionLabels[i]).length > 0, "Blank option");
            prediction.options.push();
            OptionData storage optionData = prediction.options[prediction.options.length - 1];
            optionData.label = optionLabels[i];
            optionData.encryptedSelections = FHE.asEuint64(0);
            optionData.encryptedStakeTotal = FHE.asEuint64(0);
            FHE.allowThis(optionData.encryptedSelections);
            FHE.allowThis(optionData.encryptedStakeTotal);
        }

        uint256 predictionId = _predictions.length - 1;
        emit PredictionCreated(predictionId, msg.sender, title);
        return predictionId;
    }

    /// @notice Enables or disables new selections for a prediction
    function setPredictionActive(uint256 predictionId, bool isActive) external {
        Prediction storage prediction = _predictionById(predictionId);
        if (prediction.creator != msg.sender) {
            revert NotPredictionCreator(msg.sender);
        }
        prediction.active = isActive;
        emit PredictionStatusChanged(predictionId, isActive);
    }

    /// @notice Places an encrypted selection funded by PredictCoin
    /// @param predictionId The prediction identifier
    /// @param encryptedOption The encrypted option index (0-based)
    /// @param optionProof Proof created by the relayer SDK for the option
    /// @param encryptedStake The encrypted PredictCoin amount to stake
    /// @param stakeProof Proof created by the relayer SDK for the stake
    function placeEncryptedSelection(
        uint256 predictionId,
        externalEuint8 encryptedOption,
        bytes calldata optionProof,
        externalEuint64 encryptedStake,
        bytes calldata stakeProof
    ) external {
        Prediction storage prediction = _predictionById(predictionId);
        if (!prediction.active) {
            revert InactivePrediction(predictionId);
        }

        // Transfer PredictCoin using the encrypted stake amount; returns the encrypted value that moved
        euint64 transferredStake = predictCoin.confidentialTransferFrom(
            msg.sender,
            address(this),
            encryptedStake,
            stakeProof
        );

        euint8 optionValue = FHE.fromExternal(encryptedOption, optionProof);

        prediction.encryptedTotalStake = FHE.add(prediction.encryptedTotalStake, transferredStake);
        FHE.allowThis(prediction.encryptedTotalStake);
        FHE.allow(prediction.encryptedTotalStake, msg.sender);

        // Track per-user encrypted stake and most recent encrypted choice
        euint64 updatedUserStake = FHE.add(_userStakes[predictionId][msg.sender], transferredStake);
        _userStakes[predictionId][msg.sender] = updatedUserStake;
        FHE.allowThis(updatedUserStake);
        FHE.allow(updatedUserStake, msg.sender);

        _userChoices[predictionId][msg.sender] = optionValue;
        FHE.allowThis(optionValue);
        FHE.allow(optionValue, msg.sender);

        uint256 optionCount = prediction.options.length;
        for (uint256 i = 0; i < optionCount; i++) {
            OptionData storage optionData = prediction.options[i];
            ebool matches = FHE.eq(optionValue, FHE.asEuint8(uint8(i)));

            optionData.encryptedSelections = FHE.add(
                optionData.encryptedSelections,
                FHE.select(matches, FHE.asEuint64(1), FHE.asEuint64(0))
            );
            FHE.allowThis(optionData.encryptedSelections);
            FHE.allow(optionData.encryptedSelections, msg.sender);

            optionData.encryptedStakeTotal = FHE.add(
                optionData.encryptedStakeTotal,
                FHE.select(matches, transferredStake, FHE.asEuint64(0))
            );
            FHE.allowThis(optionData.encryptedStakeTotal);
            FHE.allow(optionData.encryptedStakeTotal, msg.sender);
        }

        emit EncryptedSelectionPlaced(predictionId, msg.sender, transferredStake);
    }

    /// @notice Returns the number of predictions created so far
    function predictionsCount() external view returns (uint256) {
        return _predictions.length;
    }

    /// @notice Returns metadata for a prediction, including encrypted tallies
    function getPrediction(uint256 predictionId)
        external
        view
        returns (
            string memory title,
            address creator,
            bool active,
            uint64 createdAt,
            string[] memory optionLabels,
            euint64[] memory encryptedSelections,
            euint64[] memory encryptedStakes,
            euint64 totalEncryptedStake
        )
    {
        Prediction storage prediction = _predictionById(predictionId);
        uint256 optionCount = prediction.options.length;

        optionLabels = new string[](optionCount);
        encryptedSelections = new euint64[](optionCount);
        encryptedStakes = new euint64[](optionCount);

        for (uint256 i = 0; i < optionCount; i++) {
            OptionData storage optionData = prediction.options[i];
            optionLabels[i] = optionData.label;
            encryptedSelections[i] = optionData.encryptedSelections;
            encryptedStakes[i] = optionData.encryptedStakeTotal;
        }

        return (
            prediction.title,
            prediction.creator,
            prediction.active,
            prediction.createdAt,
            optionLabels,
            encryptedSelections,
            encryptedStakes,
            prediction.encryptedTotalStake
        );
    }

    /// @notice Returns the encrypted stake stored for a user inside a prediction
    function getUserStake(uint256 predictionId, address user) external view returns (euint64) {
        return _userStakes[predictionId][user];
    }

    /// @notice Returns the last encrypted choice submitted by a user for a prediction
    function getUserChoice(uint256 predictionId, address user) external view returns (euint8) {
        return _userChoices[predictionId][user];
    }

    /// @notice Returns the PredictCoin address that funds all selections
    function predictCoinAddress() external view returns (address) {
        return address(predictCoin);
    }

    function _predictionById(uint256 predictionId) private view returns (Prediction storage) {
        if (predictionId >= _predictions.length) {
            revert InvalidPredictionId(predictionId);
        }
        return _predictions[predictionId];
    }
}
