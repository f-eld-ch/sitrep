/** biome-ignore-all lint/correctness/useUniqueElementIds: required to test for ids */
import { fc } from "@fast-check/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { Attachment, Division, Message } from "../../types";
import { Medium, PriorityStatus, TriageStatus } from "../../types";
import MessageContainer from "./Message";

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    filename: "file.jpg",
    contentType: "image/jpeg",
    size: 1024,
    createdAt: new Date(),
    uploadedBy: "user-1",
    url: "/api/v2/attachments/att-1",
    ...overrides,
  };
}

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string | string[]) => key,
    i18n: { language: "en" },
  }),
}));

// Mock useBooleanFlagValue
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: () => true,
}));

// Mock dayjs
vi.mock("dayjs", () => {
  const actual = vi.importActual("dayjs");
  return {
    __esModule: true,
    default: Object.assign(
      (_date: unknown) => ({
        format: () => "formatted-date",
        locale: () => ({ format: () => "formatted-date" }),
      }),
      { extend: vi.fn() },
    ),
    ...actual,
  };
});

describe("MessageContainer", () => {
  const baseMessage: Message = {
    id: "msg1",
    number: 0,
    sender: "Alice",
    senderDetail: "HQ",
    receiver: "Bob",
    receiverDetail: "Field",
    time: new Date(),
    content: "**Hello** _World_",
    priorityId: PriorityStatus.High,
    triageId: TriageStatus.Pending,
    divisions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    medium: Medium.Email,
    attachments: [],
  };
  const divisions: Division[] = [];

  it("renders sender, receiver, and content", () => {
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={baseMessage}
        divisions={divisions}
        showControls={false}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Hello", { exact: false })).toBeInTheDocument();
  });

  it("renders edit button and calls setEditorMessage", () => {
    const setEditorMessage = vi.fn();
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={baseMessage}
        divisions={divisions}
        showControls={true}
        setEditorMessage={setEditorMessage}
      />,
    );
    fireEvent.click(screen.getByTestId("edit-button"));
    expect(setEditorMessage).toHaveBeenCalledWith(baseMessage);
  });

  it("renders print button if triaged", () => {
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={{ ...baseMessage, triageId: TriageStatus.Triaged }}
        divisions={divisions}
        showControls={true}
      />,
    );
    expect(screen.getByTestId("print-button")).toBeInTheDocument();
  });

  it("renders save triage button and calls setTriageMessage", () => {
    const setTriageMessage = vi.fn();
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={baseMessage}
        divisions={divisions}
        showControls={true}
        setTriageMessage={setTriageMessage}
      />,
    );
    fireEvent.click(screen.getByTestId("save-triage-button"));
    expect(setTriageMessage).toHaveBeenCalledWith(baseMessage);
  });

  it("renders create new task button if showTasks is true", () => {
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={baseMessage}
        divisions={divisions}
        showControls={true}
      />,
    );
    fireEvent.click(screen.getByTestId("create-task-button"));
    expect(screen.getByTestId("create-task-button")).toBeInTheDocument();
  });

  it("does not render message number when number is 0 (not yet assigned)", () => {
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={baseMessage}
        divisions={divisions}
        showControls={false}
      />,
    );
    expect(screen.queryByTestId("number-msg1")).not.toBeInTheDocument();
  });

  it("renders message number when number is defined", () => {
    render(
      <MessageContainer
        id="msg1"
        incidentId="incident1"
        message={{ ...baseMessage, number: 42 }}
        divisions={divisions}
        showControls={false}
      />,
    );
    expect(screen.getByTestId("number-msg1").textContent).toBe("# 42");
    expect(screen.getByText("message.id")).toBeInTheDocument();
  });

  it("renders correct message number for various values", () => {
    for (const num of [1, 99, 1000]) {
      const { unmount } = render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, number: num }}
          divisions={divisions}
          showControls={false}
        />,
      );
      expect(screen.getByTestId("number-msg1").textContent).toBe(`# ${num}`);
      unmount();
    }
  });

  describe("attachment rendering", () => {
    it("shows no attachment section when attachments is empty", () => {
      render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={baseMessage}
          divisions={divisions}
          showControls={false}
        />,
      );
      expect(screen.queryByText("message.attachments.title")).not.toBeInTheDocument();
    });

    it("shows the Attachments heading when there are attachments", () => {
      render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, attachments: [makeAttachment()] }}
          divisions={divisions}
          showControls={false}
        />,
      );
      expect(screen.getByText("message.attachments.title")).toBeInTheDocument();
    });

    it("renders an image attachment as a thumbnail linking to the file in a new tab", () => {
      const att = makeAttachment({ id: "img-1", filename: "photo.jpg", contentType: "image/jpeg", url: "/api/v2/attachments/img-1" });
      render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, attachments: [att] }}
          divisions={divisions}
          showControls={false}
        />,
      );
      const img = screen.getByAltText("photo.jpg");
      expect(img).toBeInTheDocument();
      const link = img.closest("a");
      expect(link).toHaveAttribute("href", "/api/v2/attachments/img-1");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("renders a PDF attachment as a tag pill opening in a new tab", () => {
      const att = makeAttachment({ id: "pdf-1", filename: "report.pdf", contentType: "application/pdf", url: "/api/v2/attachments/pdf-1" });
      render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, attachments: [att] }}
          divisions={divisions}
          showControls={false}
        />,
      );
      const link = screen.getByText("report.pdf").closest("a");
      expect(link).toHaveAttribute("href", "/api/v2/attachments/pdf-1");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).not.toHaveAttribute("download");
    });

    it("renders a ZIP attachment as a tag pill with a download attribute", () => {
      const att = makeAttachment({ id: "zip-1", filename: "data.zip", contentType: "application/zip", url: "/api/v2/attachments/zip-1" });
      render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, attachments: [att] }}
          divisions={divisions}
          showControls={false}
        />,
      );
      const link = screen.getByText("data.zip").closest("a");
      expect(link).toHaveAttribute("download", "data.zip");
      expect(link).not.toHaveAttribute("target", "_blank");
    });

    it("renders images and non-images in separate rows (no mixed alignment)", () => {
      const img = makeAttachment({ id: "i1", filename: "photo.jpg", contentType: "image/jpeg" });
      const pdf = makeAttachment({ id: "p1", filename: "doc.pdf", contentType: "application/pdf" });
      const { container } = render(
        <MessageContainer
          id="msg1"
          incidentId="incident1"
          message={{ ...baseMessage, attachments: [img, pdf] }}
          divisions={divisions}
          showControls={false}
        />,
      );
      const imgEl = screen.getByAltText("photo.jpg");
      const pdfEl = screen.getByText("doc.pdf");
      // They must not share the same immediate parent flex container
      expect(imgEl.closest("div")).not.toBe(pdfEl.closest("div"));
    });
  });

  it("renders with random message data (fast-check)", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          sender: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          senderDetail: fc.string(),
          receiver: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          receiverDetail: fc.string(),
          time: fc.date(),
          content: fc.string({ minLength: 10 }),
          priorityId: fc.constantFrom(PriorityStatus.High, PriorityStatus.Normal),
          triageId: fc.constantFrom(
            TriageStatus.Pending,
            TriageStatus.Triaged,
            TriageStatus.MoreInfo,
          ),
          divisions: fc.constant([]),
          createdAt: fc.date(),
          updatedAt: fc.date(),
          deletedAt: fc.date(),
          medium: fc.constantFrom(Medium.Email, Medium.Phone, Medium.Radio),
          number: fc.nat(),
          attachments: fc.constant([] as Attachment[]),
        }),
        (msg) => {
          const { unmount } = render(
            <MessageContainer
              id={msg.id}
              incidentId="incident1"
              message={{ ...msg, divisions: [...msg.divisions] } as Message}
              divisions={[]}
              showControls={false}
            />,
            { reactStrictMode: false },
          );
          expect(screen.getByTestId(`sender-${msg.id}`).textContent).toBe(msg.sender);
          expect(screen.getByTestId(`receiver-${msg.id}`).textContent).toBe(msg.receiver);
          if (msg.number > 0) {
            // oxlint-disable-next-line jest/no-conditional-expect
            expect(screen.getByTestId(`number-${msg.id}`).textContent).toBe(`# ${msg.number}`);
          } else {
            // oxlint-disable-next-line jest/no-conditional-expect
            expect(screen.queryByTestId(`number-${msg.id}`)).not.toBeInTheDocument();
          }
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
