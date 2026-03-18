import type { CodeAwareCognitiveEdge, NodeMasteryScore } from "core";
import {
  applyKnowledgeCardInteraction,
  deriveEvidenceFromInteraction,
} from "./masteryTrackingEngine";

describe("deriveEvidenceFromInteraction", () => {
  it("maps timed-view to strong positive evidence", () => {
    expect(
      deriveEvidenceFromInteraction({ type: "timed-view", value: "step" }),
    ).toBe(0.85);
    expect(
      deriveEvidenceFromInteraction({
        type: "timed-view",
        value: "knowledge-card",
      }),
    ).toBe(0.85);
  });

  it("maps confusion to low evidence", () => {
    expect(
      deriveEvidenceFromInteraction({ type: "confusion", value: "ask" }),
    ).toBe(0.15);
  });

  it("maps pin to low evidence", () => {
    expect(deriveEvidenceFromInteraction({ type: "pin", value: "pin" })).toBe(
      0.15,
    );
  });

  it("maps understanding-complete to strong positive evidence", () => {
    expect(
      deriveEvidenceFromInteraction({ type: "understanding-complete" }),
    ).toBe(0.9);
  });
});

describe("applyKnowledgeCardInteraction", () => {
  it("updates linked knowledge node mastery with timed-view", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "background-knowledge",
        score: 0.5,
        updatedAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1"],
      interaction: { type: "timed-view", value: "step" },
      nodeMasteryScores: scores,
      cognitiveEdges: [],
    });

    const updated = result.updatedScores.find(
      (item) =>
        item.nodeId === "k-1" && item.nodeType === "background-knowledge",
    );

    expect(updated).toBeDefined();
    // (1 - 0.5) * 0.5 + 0.5 * 0.85 = 0.675
    expect(updated?.score).toBeCloseTo(0.675, 5);
    expect(result.changedNodeIds).toContain("k-1");
  });

  it("propagates three hops", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "background-knowledge",
        score: 0.5,
        updatedAt: 1,
      },
      { nodeId: "s-1", nodeType: "step", score: 0.3, updatedAt: 1 },
      {
        nodeId: "sit-1",
        nodeType: "situation",
        score: 0.2,
        updatedAt: 1,
      },
      {
        nodeId: "c-1",
        nodeType: "code-chunk",
        score: 0.1,
        updatedAt: 1,
      },
    ];

    const edges: CodeAwareCognitiveEdge[] = [
      {
        id: "e1",
        type: "dependency-forward",
        fromNodeId: "k-1",
        fromNodeType: "background-knowledge",
        toNodeId: "s-1",
        toNodeType: "step",
        conditionalMasteryProbability: 0.9,
        createdAt: 1,
      },
      {
        id: "e2",
        type: "inference-forward",
        fromNodeId: "s-1",
        fromNodeType: "step",
        toNodeId: "sit-1",
        toNodeType: "situation",
        conditionalMasteryProbability: 0.86,
        createdAt: 1,
      },
      {
        id: "e3",
        type: "inference-forward",
        fromNodeId: "sit-1",
        fromNodeType: "situation",
        toNodeId: "c-1",
        toNodeType: "code-chunk",
        conditionalMasteryProbability: 0.86,
        createdAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1"],
      interaction: { type: "timed-view", value: "knowledge-card" },
      nodeMasteryScores: scores,
      cognitiveEdges: edges,
    });

    // All 4 nodes should be changed (direct + 3 hops)
    expect(result.changedNodeIds).toEqual(
      expect.arrayContaining(["k-1", "s-1", "sit-1", "c-1"]),
    );

    const c1 = result.updatedScores.find(
      (item) => item.nodeId === "c-1" && item.nodeType === "code-chunk",
    );
    // Hop 3 should still produce a change, but attenuated
    expect(c1).toBeDefined();
    expect(c1!.score).not.toBe(0.1);
  });

  it("does not back-propagate to direct-updated nodes", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "background-knowledge",
        score: 0.5,
        updatedAt: 1,
      },
      { nodeId: "s-1", nodeType: "step", score: 0.4, updatedAt: 1 },
    ];

    const edges: CodeAwareCognitiveEdge[] = [
      {
        id: "e1",
        type: "dependency-forward",
        fromNodeId: "k-1",
        fromNodeType: "background-knowledge",
        toNodeId: "s-1",
        toNodeType: "step",
        conditionalMasteryProbability: 0.9,
        createdAt: 1,
      },
      {
        id: "e2",
        type: "dependency-reverse",
        fromNodeId: "s-1",
        fromNodeType: "step",
        toNodeId: "k-1",
        toNodeType: "background-knowledge",
        conditionalMasteryProbability: 0.6,
        createdAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1"],
      interaction: { type: "understanding-complete" },
      nodeMasteryScores: scores,
      cognitiveEdges: edges,
    });

    const k1 = result.updatedScores.find(
      (item) =>
        item.nodeId === "k-1" && item.nodeType === "background-knowledge",
    );
    // Direct update: (1-0.5)*0.5 + 0.5*0.9 = 0.7
    expect(k1?.score).toBeCloseTo(0.7, 5);

    // s-1 should be propagated but k-1 should NOT be overwritten by reverse edge
    expect(result.changedNodeIds).toEqual(
      expect.arrayContaining(["k-1", "s-1"]),
    );
  });
});
