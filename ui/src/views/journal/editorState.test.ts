import { fc } from "@fast-check/vitest";
import { Medium, type Message, PriorityStatus, TriageStatus } from "types";
import {
  type EditorAction,
  type EditorState,
  buildMessageVars,
  canSave,
  editorReducer,
  initEditorState,
} from "./editorState";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    content: "hello",
    sender: "Alice",
    senderDetail: "HQ",
    receiver: "Bob",
    receiverDetail: "Field",
    time: new Date("2024-01-01T10:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Pending,
    priorityId: PriorityStatus.Normal,
    ...overrides,
  };
}

function reduce(actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, initEditorState());
}

describe("editorReducer", () => {
  describe("set_edit_message", () => {
    it("loads a Phone message — radioChannel stays empty (defect 3 lock)", () => {
      const phoneMsg = makeMessage({ medium: Medium.Phone, senderDetail: "555-1234" });
      const state = reduce([{ type: "set_edit_message", message: phoneMsg }]);
      expect(state.radioChannel).toBe("");
      expect(state.senderDetail).toBe("555-1234");
    });

    it("loads a Radio message — radioChannel gets senderDetail, senderDetail clears", () => {
      const radioMsg = makeMessage({ medium: Medium.Radio, senderDetail: "CH-1" });
      const state = reduce([{ type: "set_edit_message", message: radioMsg }]);
      expect(state.radioChannel).toBe("CH-1");
      expect(state.senderDetail).toBe("");
    });

    it("loads all text fields from the message", () => {
      const msg = makeMessage({ medium: Medium.Email, sender: "x", receiver: "y", content: "z" });
      const state = reduce([{ type: "set_edit_message", message: msg }]);
      expect(state.sender).toBe("x");
      expect(state.receiver).toBe("y");
      expect(state.content).toBe("z");
      expect(state.messageToEdit).toBe(msg);
    });
  });

  describe("set_media_detail", () => {
    it("Radio→Phone→Radio — detail fields stay isolated", () => {
      const state = reduce([
        { type: "set_media_detail", detail: { type: Medium.Radio, channel: "CH-5" } },
        {
          type: "set_media_detail",
          detail: { type: Medium.Phone, sender: "123", receiver: "456" },
        },
        { type: "set_media_detail", detail: { type: Medium.Radio, channel: "CH-9" } },
      ]);
      expect(state.media).toBe(Medium.Radio);
      expect(state.radioChannel).toBe("CH-9");
      expect(state.senderDetail).toBe("123");
    });
  });

  describe("set_time", () => {
    it("stores a Date", () => {
      const d = new Date("2024-06-01T08:00:00Z");
      const state = reduce([{ type: "set_time", time: d }]);
      expect(state.time).toBe(d);
    });

    it("accepts undefined (clear-field path)", () => {
      const state = reduce([
        { type: "set_time", time: new Date() },
        { type: "set_time", time: undefined },
      ]);
      expect(state.time).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("resets to initEditorState", () => {
      const dirty = reduce([
        { type: "set_sender", sender: "Alice" },
        { type: "set_content", content: "some content" },
      ]);
      const cleared = editorReducer(dirty, { type: "clear" });
      expect(cleared).toEqual(initEditorState());
    });
  });

  it("state.media is always a valid Medium value", () => {
    const validMedia = new Set(Object.values(Medium));
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              type: fc.constant("set_media_detail" as const),
              detail: fc.oneof(
                fc.record({ type: fc.constant(Medium.Radio as const), channel: fc.string() }),
                fc.record({
                  type: fc.constant(Medium.Phone as const),
                  sender: fc.string(),
                  receiver: fc.string(),
                }),
                fc.record({
                  type: fc.constant(Medium.Email as const),
                  sender: fc.string(),
                  receiver: fc.string(),
                }),
                fc.record({
                  type: fc.constant(Medium.Other as const),
                  sender: fc.string(),
                  receiver: fc.string(),
                }),
              ),
            }),
            fc.record({ type: fc.constant("clear" as const) }),
          ),
          { maxLength: 20 },
        ),
        (actions) => {
          const state = reduce(actions as EditorAction[]);
          expect(validMedia.has(state.media)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("every string field remains a string after any sequence of actions (defect 2 general form)", () => {
    const stringFields: (keyof EditorState)[] = [
      "sender",
      "senderDetail",
      "receiver",
      "receiverDetail",
      "content",
      "radioChannel",
    ];

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constant("set_sender" as const), sender: fc.string() }),
            fc.record({ type: fc.constant("set_receiver" as const), receiver: fc.string() }),
            fc.record({ type: fc.constant("set_content" as const), content: fc.string() }),
            fc.record({ type: fc.constant("clear" as const) }),
          ),
          { maxLength: 20 },
        ),
        (actions) => {
          const state = reduce(actions as EditorAction[]);
          for (const field of stringFields) {
            expect(typeof state[field]).toBe("string");
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("canSave", () => {
  it("returns false when content is empty", () => {
    expect(canSave({ ...initEditorState(), sender: "a", receiver: "b", content: "" })).toBe(false);
  });
  it("returns false when sender is empty", () => {
    expect(canSave({ ...initEditorState(), sender: "", receiver: "b", content: "c" })).toBe(false);
  });
  it("returns false when receiver is empty", () => {
    expect(canSave({ ...initEditorState(), sender: "a", receiver: "", content: "c" })).toBe(false);
  });
  it("returns false when field is whitespace-only", () => {
    expect(canSave({ ...initEditorState(), sender: "  ", receiver: "b", content: "c" })).toBe(
      false,
    );
  });
  it("returns true when all three are non-empty", () => {
    expect(canSave({ ...initEditorState(), sender: "a", receiver: "b", content: "c" })).toBe(true);
  });
});

describe("buildMessageVars", () => {
  const now = new Date("2024-06-01T12:00:00Z");

  it("uses injected now when state.time is undefined", () => {
    const state = initEditorState();
    const vars = buildMessageVars({ ...state, sender: "a", receiver: "b" }, "j1", now);
    expect(vars.time).toBe(now);
  });

  it("uses state.time when set", () => {
    const t = new Date("2024-03-15T09:00:00Z");
    const state = { ...initEditorState(), time: t };
    const vars = buildMessageVars(state, "j1", now);
    expect(vars.time).toBe(t);
  });

  it("uses radioChannel as both senderDetail and receiverDetail for Radio", () => {
    const state = {
      ...initEditorState(),
      media: Medium.Radio,
      radioChannel: "CH-7",
      senderDetail: "phone-number-that-should-be-ignored",
    };
    const vars = buildMessageVars(state, "j1", now);
    expect(vars.senderDetail).toBe("CH-7");
    expect(vars.receiverDetail).toBe("CH-7");
  });

  it("uses senderDetail/receiverDetail for non-Radio media", () => {
    const state = {
      ...initEditorState(),
      media: Medium.Phone,
      senderDetail: "555-1111",
      receiverDetail: "555-2222",
      radioChannel: "should-be-ignored",
    };
    const vars = buildMessageVars(state, "j1", now);
    expect(vars.senderDetail).toBe("555-1111");
    expect(vars.receiverDetail).toBe("555-2222");
  });

  it("includes incidentId from argument", () => {
    const vars = buildMessageVars(initEditorState(), "my-incident", now);
    expect(vars.incidentId).toBe("my-incident");
  });
});
