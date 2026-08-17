import type { AIAction, Block, ModelProvider, RouteStrategy } from "../types";

export type { AIAction, Block, ModelProvider, RouteStrategy };

export interface PrivacyLike {
  allowExternal: boolean;
  route: RouteStrategy;
}
