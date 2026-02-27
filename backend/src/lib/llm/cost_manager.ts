import { LlmCostConfig } from "../config/llm.schema";


export class CostManager {
  private totalTokens: number = 0;
  private promptTokens: number = 0;
  private completionTokens: number = 0;

  constructor(
    readonly config: LlmCostConfig
  ) {}

  addTokens(promptTokens: number, completionTokens: number) {
    this.promptTokens += promptTokens;
    this.completionTokens += completionTokens;
    this.totalTokens += promptTokens + completionTokens;
  }

  getCost(): number {
    const inputCost = (this.config.inputToken / this.config.scale) * this.promptTokens;
    const outputCost = (this.config.outputToken / this.config.scale) * this.completionTokens;

    return inputCost + outputCost;
  }
}