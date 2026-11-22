/* V0.53 compatibility facade: preserve UI contracts, route through the
 * verified-first directed network instead of the old nearest-end patcher. */
export {REGION_CHOICES,buildDirectedRegionRoute as buildRegionRoute,
 assembleBloodNetwork,polylineLength} from './directed-blood-network.mjs';
