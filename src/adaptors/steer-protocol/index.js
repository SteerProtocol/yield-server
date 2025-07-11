const axios = require('axios');
const utils = require('../utils');

// Fallback endpoint if env var is not provided
const STEER_API_ENDPOINT = 'https://api-v2.steer.finance'

// Mapping of chain IDs returned by the Steer API to DefiLlama chain names
const chainIdToName = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'Binance',
  137: 'Polygon',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  8453: 'Base',
  747474: 'Katana',
  59144: 'Linea',
};

// GraphQL query for the new Steer API (v2) – allows filtering by chainId
const query = `
  query($filter: VaultFilter, $first: Int, $orderBy: OrderByInput) {
    vaults(filter: $filter, first: $first, orderBy: $orderBy) {
      edges {
        node {
          id
          chainId
          vaultAddress
          token0 { address symbol decimals }
          token1 { address symbol decimals }
          beaconName
          tvl
          feeApr
        }
      }
    }
  }
`;

const getPools = async () => {
  try {
    const allPools = [];

    // iterate over every known chainId so we query in smaller chunks and easily parallelize in future if desired
    for (const chainId of Object.keys(chainIdToName)) {
      const variables = {
        filter: { chainId: Number(chainId) },
        first: 100,
        orderBy: { field: 'tvl', direction: 'DESC' },
      };

      const res = await axios.post(
        STEER_API_ENDPOINT,
        { query, variables },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const edges = (res?.data?.data?.vaults?.edges ?? []).filter(
        (vault) => vault.node.token0 != null && vault.node.token1 != null || vault.beaconName == 'ScheduledJobs'
      );

      const pools = edges.map(({ node: vault }) => {
        const chain = chainIdToName[vault.chainId];
        if (!chain) return null;
        if (vault.token0 == null || vault.token1 == null) {
          debugger;
        }
        return {
          pool: `${vault.vaultAddress}-${chain}`.toLowerCase(),
          chain,
          project: 'steer-protocol',
          symbol: `${vault.token0.symbol}-${vault.token1.symbol}`,
          tvlUsd: Number(vault.tvl),
          apyBase: Number(vault.feeApr),
          underlyingTokens: [vault.token0.address, vault.token1.address],
          poolMeta: vault.beaconName?.replace('MultiPosition', '') ?? null,
          url: `https://app.steer.finance/app/${vault.vaultAddress}`,
        };
      });

      allPools.push(...pools);
    }

    return allPools.filter((p) => p && utils.keepFinite(p)).filter(p => p.tvlUsd > 10000);
  } catch (err) {
    debugger;
    console.error('Steer adaptor error:', err.message);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getPools,
};
