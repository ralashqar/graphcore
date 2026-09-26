/** Counters of the city-scale studio batches (CitySculptCity), readable as window.__cityGwStats in development. */
export const cityGwStats={flushes:0,chunkMerges:0,chunkMergeMs:0,indexRewrites:0,kitRevisions:0,kitUploads:0,kitInstancesCopied:0,signRebuilds:0,nearChanges:0,levels:'',viewDistance:0};
if(typeof window!=='undefined'&&import.meta.env?.DEV)(window as unknown as {__cityGwStats?:typeof cityGwStats}).__cityGwStats=cityGwStats;
