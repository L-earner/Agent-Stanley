export type { HybridSearchOptions, RerankFn, SearchResult } from "./hybridSearch.ts";
export { evidenceIdForChunk, hybridSearch, searchResultToEvidence } from "./hybridSearch.ts";
export type { LexicalResult, LexicalSearchOptions } from "./lexicalSearch.ts";
export { lexicalSearch, tokenize } from "./lexicalSearch.ts";
export type { EmbeddingProvider, VectorResult, VectorSearchOptions } from "./vectorSearch.ts";
export { cosineSimilarity, DeterministicEmbeddingProvider, vectorSearch } from "./vectorSearch.ts";
