import { useState } from "react";
import { useNavigate } from "react-router";
import { useAccessGroups, useCreateAccessGroup } from "api";
import { Spinner } from "components";
import { useRedirectIfForbidden } from "utils";

/** Groups index: create a group, then manage it via the sidebar link that appears for it. */
function Groups() {
  const groupsResult = useAccessGroups();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createGroup, createState] = useCreateAccessGroup();

  useRedirectIfForbidden(groupsResult.status === "error" ? groupsResult.error : undefined);

  if (groupsResult.status === "loading") return <Spinner />;
  if (groupsResult.status === "error") {
    if (groupsResult.error.code === "FORBIDDEN") return null;
    return <div className="notification is-danger">{groupsResult.error.message}</div>;
  }

  const create = async () => {
    if (!name.trim()) return;
    const result = await createGroup({ name: name.trim(), description: description.trim() });
    setName("");
    setDescription("");
    void navigate(`${result.groupId}`);
  };

  return (
    <>
      <h2 className="title is-4">Groups</h2>

      {createState.error && (
        <div className="notification is-danger">{createState.error.message}</div>
      )}

      <div className="box">
        <h3 className="title is-5">Create group</h3>
        <div className="field">
          <label className="label" htmlFor="group-name">
            Name
          </label>
          <div className="control">
            <input
              id="group-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="group-description">
            Description
          </label>
          <div className="control">
            <textarea
              id="group-description"
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="button is-success"
          onClick={() => void create()}
          disabled={createState.loading}
        >
          Create group
        </button>
      </div>

      {groupsResult.data.groups.length === 0 ? (
        <p className="has-text-grey">No groups yet — create one above.</p>
      ) : (
        <p className="has-text-grey">Select a group from the sidebar to manage its members.</p>
      )}
    </>
  );
}

export default Groups;
