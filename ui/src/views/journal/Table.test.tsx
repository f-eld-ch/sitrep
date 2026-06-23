import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { Message } from "../../types";
import { Medium, PriorityStatus, TriageStatus } from "../../types";
import Table from "./Table";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string | string[]) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("./Editor", () => ({
  ReactPreview: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe("Table", () => {
  const baseMessage: Message = {
    id: "msg1",
    sender: "Alice",
    senderDetail: "HQ",
    receiver: "Bob",
    receiverDetail: "Field",
    time: new Date("2026-01-01T12:00:00Z"),
    content: "Hello",
    priorityId: PriorityStatus.High,
    triageId: TriageStatus.Pending,
    divisions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    medium: Medium.Email,
  };

  it("renders sender and receiver details on a separate HTML line", () => {
    render(
      <Table
        ref={null}
        messages={[baseMessage]}
        assignmentFilter="all"
        triageFilter="all"
        priorityFilter="all"
      />,
    );

    const senderCell = screen.getByRole("cell", { name: /Alice\s*\(\s*HQ\s*\)/ });
    const receiverCell = screen.getByRole("cell", { name: /Bob\s*\(\s*Field\s*\)/ });

    expect(senderCell.querySelector("br")).toBeInTheDocument();
    expect(receiverCell.querySelector("br")).toBeInTheDocument();
    expect(senderCell).toHaveTextContent(/Alice\s*\(\s*HQ\s*\)/);
    expect(receiverCell).toHaveTextContent(/Bob\s*\(\s*Field\s*\)/);
  });

  it("does not render line breaks when details are absent", () => {
    render(
      <Table
        ref={null}
        messages={[
          {
            ...baseMessage,
            id: "msg2",
            sender: "Charlie",
            senderDetail: "",
            receiver: "Dana",
            receiverDetail: undefined,
          },
        ]}
        assignmentFilter="all"
        triageFilter="all"
        priorityFilter="all"
      />,
    );

    const senderCell = screen.getByRole("cell", { name: "Charlie" });
    const receiverCell = screen.getByRole("cell", { name: "Dana" });

    expect(senderCell.querySelector("br")).not.toBeInTheDocument();
    expect(receiverCell.querySelector("br")).not.toBeInTheDocument();
  });
});
