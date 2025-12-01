import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

// Import specialized agents
import { DATA_DISCOVERY_AGENT } from './data-discovery';
import { CITATION_IMPACT_AGENT } from './citation-impact';
import { NETWORK_ANALYSIS_AGENT } from './network-analysis';
import { TRENDS_ANALYSIS_AGENT } from './trends-analysis';
import { VISUALIZATION_AGENT } from './visualization';
import { ORCHESTRATOR_PROMPT } from './orchestrator';

/**
 * Specialized Research Sub-Agents
 *
 * Each agent is an expert in a specific domain:
 * - data-discovery: Find and search for research entities
 * - citation-impact: Identify highly cited/influential research
 * - network-analysis: Build and analyze relationship networks
 * - trends-analysis: Analyze temporal patterns and trends
 * - visualization: Create charts and visualizations
 */
export const RESEARCH_SUBAGENTS: Record<string, AgentDefinition> = {
  'data-discovery': DATA_DISCOVERY_AGENT,
  'citation-impact': CITATION_IMPACT_AGENT,
  'network-analysis': NETWORK_ANALYSIS_AGENT,
  'trends-analysis': TRENDS_ANALYSIS_AGENT,
  'visualization': VISUALIZATION_AGENT,
};

/**
 * Main Orchestrator Prompt
 *
 * Coordinates the specialized sub-agents
 */
export { ORCHESTRATOR_PROMPT };

/**
 * Export individual agents for direct access if needed
 */
export {
  DATA_DISCOVERY_AGENT,
  CITATION_IMPACT_AGENT,
  NETWORK_ANALYSIS_AGENT,
  TRENDS_ANALYSIS_AGENT,
  VISUALIZATION_AGENT,
};
