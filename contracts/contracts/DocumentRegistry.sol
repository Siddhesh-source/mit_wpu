// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DocumentRegistry
/// @notice Anchors SHA-256 hashes of sealed approval PDFs. Stores no personal data:
///         only hashes, issuing college, request id, type, version, validity window and status.
contract DocumentRegistry {
    enum Status { None, Active, Superseded, Revoked }

    struct Record {
        bytes32 issuer;      // issuing college ID (the node in a multi-college network), e.g. "COLLEGE-001"
        bytes32 requestId;   // e.g. "PLC-2026-0001" as bytes32
        bytes32 docType;     // e.g. "event_permission" as bytes32
        uint32 version;      // 1, 2, ...
        bytes32 prevHash;    // hash of the version this one amends (0 for v1)
        bytes32 rolesHash;   // SHA-256 of the canonical list of signer roles and times
        uint64 sealedAt;     // unix seconds
        uint64 validFrom;    // unix seconds
        uint64 validUntil;   // unix seconds
        Status status;
    }

    address public immutable owner;
    mapping(bytes32 => Record) private records;          // docHash => record
    mapping(bytes32 => bytes32) public supersededBy;     // old docHash => new docHash
    mapping(bytes32 => bytes32) public latestFor;        // requestId => latest docHash
    mapping(bytes32 => uint8) public revokeReason;       // docHash => reason code

    event Sealed(bytes32 indexed docHash, bytes32 indexed requestId, uint32 version, bytes32 prevHash);
    event Superseded(bytes32 indexed oldHash, bytes32 indexed newHash);
    event Revoked(bytes32 indexed docHash, uint8 reasonCode);

    error NotOwner();
    error EmptyHash();
    error AlreadySealed();
    error RequestAlreadySealed();
    error PrevNotActive();
    error PrevOtherRequest();
    error BadVersion();
    error NotActive();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Seal a document. With prevHash set, the previous version must be Active and is marked Superseded.
    function seal(bytes32 docHash, Record calldata r) external onlyOwner {
        if (docHash == bytes32(0)) revert EmptyHash();
        if (records[docHash].status != Status.None) revert AlreadySealed();

        if (r.prevHash == bytes32(0)) {
            if (latestFor[r.requestId] != bytes32(0)) revert RequestAlreadySealed();
            if (r.version != 1) revert BadVersion();
        } else {
            Record storage p = records[r.prevHash];
            if (p.status != Status.Active) revert PrevNotActive();
            if (p.requestId != r.requestId) revert PrevOtherRequest();
            if (r.version != p.version + 1) revert BadVersion();
            p.status = Status.Superseded;
            supersededBy[r.prevHash] = docHash;
            emit Superseded(r.prevHash, docHash);
        }

        records[docHash] = Record({
            issuer: r.issuer,
            requestId: r.requestId,
            docType: r.docType,
            version: r.version,
            prevHash: r.prevHash,
            rolesHash: r.rolesHash,
            sealedAt: uint64(block.timestamp),
            validFrom: r.validFrom,
            validUntil: r.validUntil,
            status: Status.Active
        });
        latestFor[r.requestId] = docHash;
        emit Sealed(docHash, r.requestId, r.version, r.prevHash);
    }

    /// @notice Revoke an active document.
    function revoke(bytes32 docHash, uint8 reasonCode) external onlyOwner {
        if (records[docHash].status != Status.Active) revert NotActive();
        records[docHash].status = Status.Revoked;
        revokeReason[docHash] = reasonCode;
        emit Revoked(docHash, reasonCode);
    }

    function get(bytes32 docHash) external view returns (Record memory) {
        return records[docHash];
    }
}
