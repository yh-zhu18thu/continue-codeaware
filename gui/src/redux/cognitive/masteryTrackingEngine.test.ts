import type { CodeAwareCognitiveEdge, NodeMasteryScore } from "core";
import {
  applyKnowledgeCardInteraction,
  deriveEvidenceFromInteraction,
} from "./masteryTrackingEngine";

describe("deriveEvidenceFromInteraction", () => {
  it("maps feedback and answer interactions to configured evidence values", () => {
    expect(
      deriveEvidenceFromInteraction({ type: "feedback", value: "understood" }),
    ).toBe(0.8);
    expect(
      deriveEvidenceFromInteraction({ type: "feedback", value: "uncertain" }),
    ).toBe(0.25);
    expect(
      deriveEvidenceFromInteraction({ type: "view-major", value: "read" }),
    ).toBe(0.45);
    expect(
      deriveEvidenceFromInteraction({ type: "view-major", value: "self-test" }),
    ).toBe(0.55);
    expect(
      deriveEvidenceFromInteraction({ type: "answer", correctness: 1 }),
    ).toBe(0.85);
    expect(
      deriveEvidenceFromInteraction({ type: "answer", correctness: 0 }),
    ).toBe(0.2);
  });
});

describe("applyKnowledgeCardInteraction", () => {
  it("updates linked knowledge node mastery directly", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "knowledge-point",
        score: 0.5,
        updatedAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1"],
      interaction: { type: "feedback", value: "understood" },
      nodeMasteryScores: scores,
      cognitiveEdges: [],
    });

    const updated = result.updatedScores.find(
      (item) => item.nodeId === "k-1" && item.nodeType === "knowledge-point",
    );

    expect(updated).toBeDefined();
    expect(updated?.score).toBeCloseTo(0.605, 5);
    expect(result.changedNodeIds).toContain("k-1");
  });

  it("propagates one hop and ignores back-propagation to direct-updated nodes", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "knowledge-point",
        score: 0.5,
        updatedAt: 1,
      },
      {
        nodeId: "s-1",
        nodeType: "step",
        score: 0.4,
        updatedAt: 1,
      },
    ];

    const edges: CodeAwareCognitiveEdge[] = [
      {
        id: "e1",
        type: "knowledge-to-step-forward",
        fromNodeId: "k-1",
        fromNodeType: "knowledge-point",
        toNodeId: "s-1",
        toNodeType: "step",
        conditionalMasteryProbability: 0.9,
        createdAt: 1,
      },
      {
        id: "e2",
        type: "knowledge-to-step-reverse",
        fromNodeId: "s-1",
        fromNodeType: "step",
        toNodeId: "k-1",
        toNodeType: "knowledge-point",
        conditionalMasteryProbability: 0.6,
        createdAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1"],
      interaction: { type: "feedback", value: "understood" },
      nodeMasteryScores: scores,
      cognitiveEdges: edges,
    });

    const k1 = result.updatedScores.find(
      (item) => item.nodeId === "k-1" && item.nodeType === "knowledge-point",
    );
    const s1 = result.updatedScores.find(
      (item) => item.nodeId === "s-1" && item.nodeType === "step",
    );

    expect(k1?.score).toBeCloseTo(0.605, 5);
    expect(s1?.score).toBeCloseTo(0.446, 5);
    expect(result.changedNodeIds).toEqual(
      expect.arrayContaining(["k-1", "s-1"]),
    );
  });

  it("uses max candidate when multiple propagation sources target same node", () => {
    const scores: NodeMasteryScore[] = [
      {
        nodeId: "k-1",
        nodeType: "knowledge-point",
        score: 0.5,
        updatedAt: 1,
      },
      {
        nodeId: "k-2",
        nodeType: "knowledge-point",
        score: 0.5,
        updatedAt: 1,
      },
      {
        nodeId: "s-1",
        nodeType: "step",
        score: 0.2,
        updatedAt: 1,
      },
    ];

    const edges: CodeAwareCognitiveEdge[] = [
      {
        id: "e1",
        type: "knowledge-to-step-forward",
        fromNodeId: "k-1",
        fromNodeType: "knowledge-point",
        toNodeId: "s-1",
        toNodeType: "step",
        conditionalMasteryProbability: 0.9,
        createdAt: 1,
      },
      {
        id: "e2",
        type: "knowledge-to-step-forward",
        fromNodeId: "k-2",
        fromNodeType: "knowledge-point",
        toNodeId: "s-1",
        toNodeType: "step",
        conditionalMasteryProbability: 0.55,
        createdAt: 1,
      },
    ];

    const result = applyKnowledgeCardInteraction({
      linkedKnowledgeNodeIds: ["k-1", "k-2"],
      interaction: { type: "feedback", value: "understood" },
      nodeMasteryScores: scores,
      cognitiveEdges: edges,
    });

    const s1 = result.updatedScores.find(
      (item) => item.nodeId === "s-1" && item.nodeType === "step",
    );

    // Candidate from k-1 should win over k-2 for this setup.
    expect(s1?.score).toBeCloseTo(0.296, 5);
  });
});
