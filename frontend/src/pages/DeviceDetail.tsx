import { Fragment, type FormEvent, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DeviceComponentInput, inventoryApi } from "../lib/api";
import { ArrowLeft, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";

interface DeviceComponent extends DeviceComponentInput {
  id: string;
}

interface DeviceComponentHistory {
  id: string;
  componentName: string;
  action: "ADDED" | "UPDATED" | "REMOVED";
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedAt: string;
}

interface ComponentFormState {
  category: string;
  customCategory: string;
  name: string;
  manufacturer: string;
  model: string;
  sizeInches: string;
  details: string;
  specifications: Record<string, string>;
  customSpecifications: Array<{ id: number; name: string; value: string }>;
}

const DEFAULT_COMPONENT_FORM: ComponentFormState = {
  category: "Screen",
  customCategory: "",
  name: "",
  manufacturer: "",
  model: "",
  sizeInches: "",
  details: "",
  specifications: {},
  customSpecifications: [],
};

const COMPONENT_FIELD_LABELS: Record<string, string> = {
  category: "Type",
  name: "Name",
  manufacturer: "Manufacturer",
  model: "Model",
  sizeInches: "Screen size",
  details: "Details",
};

const SPECIFICATION_LABELS: Record<string, string> = {
  screenTechnology: "Screen technology",
  resolution: "Resolution",
  refreshRateHz: "Refresh rate (Hz)",
  ports: "Ports",
  connection: "Connection",
  sensor: "Sensor",
  dpi: "DPI",
  buttons: "Number of buttons",
  switchType: "Switch type",
  layout: "Layout / language",
  keyCount: "Number of keys",
};

const COMPONENT_SPECIFICATION_FIELDS: Record<
  string,
  Array<{ key: string; label: string; placeholder?: string; type?: string }>
> = {
  Screen: [
    { key: "screenTechnology", label: "Screen technology", placeholder: "LED, IPS, OLED..." },
    { key: "resolution", label: "Resolution", placeholder: "1920 × 1080" },
    { key: "refreshRateHz", label: "Refresh rate (Hz)", type: "number" },
    { key: "ports", label: "Ports", placeholder: "HDMI, DisplayPort..." },
  ],
  Monitor: [
    { key: "screenTechnology", label: "Screen technology", placeholder: "LED, IPS, OLED..." },
    { key: "resolution", label: "Resolution", placeholder: "1920 × 1080" },
    { key: "refreshRateHz", label: "Refresh rate (Hz)", type: "number" },
    { key: "ports", label: "Ports", placeholder: "HDMI, DisplayPort..." },
  ],
  Mouse: [
    { key: "connection", label: "Connection", placeholder: "Wired, wireless, Bluetooth..." },
    { key: "sensor", label: "Sensor", placeholder: "Optical, laser..." },
    { key: "dpi", label: "DPI", type: "number" },
    { key: "buttons", label: "Number of buttons", type: "number" },
  ],
  Keyboard: [
    { key: "connection", label: "Connection", placeholder: "Wired, wireless, Bluetooth..." },
    { key: "switchType", label: "Switch type", placeholder: "Mechanical, membrane..." },
    { key: "layout", label: "Layout / language", placeholder: "English, Arabic..." },
    { key: "keyCount", label: "Number of keys", type: "number" },
  ],
};

function formatHistoryValue(field: string, value: unknown) {
  if (value == null || value === "") return "—";
  if (field === "sizeInches") return `${String(value)} in`;
  return String(value);
}

function isScreenCategory(category: string) {
  return category === "Screen" || category === "Monitor";
}

function getSpecificationLabel(key: string) {
  return SPECIFICATION_LABELS[key] ?? key;
}

function flattenHistoryValue(snapshot: Record<string, unknown> | null) {
  const values = { ...(snapshot ?? {}) };
  const specifications = values.specifications;
  delete values.specifications;
  if (specifications && typeof specifications === "object" && !Array.isArray(specifications)) {
    for (const [key, value] of Object.entries(specifications)) {
      values[`specifications.${key}`] = value;
    }
  }
  return values;
}

function getHistoryFieldLabel(field: string) {
  if (field.startsWith("specifications.")) {
    return getSpecificationLabel(field.slice("specifications.".length));
  }
  return COMPONENT_FIELD_LABELS[field] ?? field;
}

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [softwareSearch, setSoftwareSearch] = useState("");
  const [components, setComponents] = useState<ComponentFormState>({
    ...DEFAULT_COMPONENT_FORM,
  });
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [componentError, setComponentError] = useState("");
  const [savingComponent, setSavingComponent] = useState(false);

  useEffect(() => {
    const loadDevice = async () => {
      if (!id) {
        setError("No device ID provided");
        return;
      }
      try {
        const res = await inventoryApi.detail(id);
        setDevice(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load device");
      } finally {
        setLoading(false);
      }
    };

    loadDevice();
  }, [id]);

  if (loading) return <div>Loading device details...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!device) return <div>Device not found</div>;

  const installedSoftware = device.installedSoftware ?? device.software ?? [];
  const deviceComponents: DeviceComponent[] = device.components ?? [];
  const componentHistory: DeviceComponentHistory[] = device.componentHistory ?? [];
  const filteredSoftware = installedSoftware.filter((sw: any) =>
    sw.name.toLocaleLowerCase().includes(softwareSearch.trim().toLocaleLowerCase()),
  );

  const reloadDevice = async () => {
    if (!id) return;
    const res = await inventoryApi.detail(id);
    setDevice(res.data);
  };

  const resetComponentForm = () => {
    setComponents({ ...DEFAULT_COMPONENT_FORM });
    setEditingComponentId(null);
    setComponentError("");
  };

  const changeComponentCategory = (category: string) => {
    setComponents({
      ...DEFAULT_COMPONENT_FORM,
      category,
    });
  };

  const updateSpecification = (key: string, value: string) => {
    setComponents((current) => ({
      ...current,
      specifications: { ...current.specifications, [key]: value },
    }));
  };

  const editComponent = (component: DeviceComponent) => {
    const predefinedCategories = ["Screen", "Monitor", "Mouse", "Keyboard"];
    const specifications = component.specifications ?? {};
    const category =
      component.category === "Monitor" ? "Screen" : component.category;
    setComponents({
      category: predefinedCategories.includes(component.category)
        ? category
        : "Custom",
      customCategory: predefinedCategories.includes(component.category)
        ? ""
        : component.category,
      name: component.name,
      manufacturer: component.manufacturer ?? "",
      model: component.model ?? "",
      sizeInches: component.sizeInches?.toString() ?? "",
      details: component.details ?? "",
      specifications: { ...specifications },
      customSpecifications: Object.entries(specifications).map(
        ([name, value], index) => ({ id: index, name, value }),
      ),
    });
    setEditingComponentId(component.id);
    setComponentError("");
  };

  const saveComponent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const category =
      components.category === "Custom"
        ? components.customCategory.trim()
        : components.category;
    if (!category || !components.name.trim()) {
      setComponentError("Component type and name are required.");
      return;
    }
    if (!id) return;

    const specifications =
      components.category === "Custom"
        ? Object.fromEntries(
            components.customSpecifications
              .map(({ name, value }) => [name.trim(), value.trim()] as const)
              .filter(([name, value]) => name && value),
          )
        : components.specifications;
    const payload: DeviceComponentInput = {
      category,
      name: components.name.trim(),
      manufacturer: components.manufacturer.trim() || null,
      model: components.model.trim() || null,
      sizeInches:
        isScreenCategory(category) && components.sizeInches
          ? Number(components.sizeInches)
          : null,
      details: components.details.trim() || null,
      specifications,
    };

    setSavingComponent(true);
    setComponentError("");
    try {
      if (editingComponentId) {
        await inventoryApi.updateComponent(id, editingComponentId, payload);
      } else {
        await inventoryApi.addComponent(id, payload);
      }
      resetComponentForm();
      await reloadDevice();
    } catch (err) {
      setComponentError(
        err instanceof Error ? err.message : "Could not save this component.",
      );
    } finally {
      setSavingComponent(false);
    }
  };

  const deleteComponent = async (componentId: string) => {
    if (!id || !window.confirm("Remove this component? Its history will be kept.")) {
      return;
    }
    setComponentError("");
    try {
      await inventoryApi.removeComponent(id, componentId);
      if (editingComponentId === componentId) resetComponentForm();
      await reloadDevice();
    } catch (err) {
      setComponentError(
        err instanceof Error ? err.message : "Could not remove this component.",
      );
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate("/devices")}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Devices
      </button>

      <h1 className="text-3xl font-bold mb-8">{device.computerName}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware Info */}
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Hardware</h2>
          <div className="space-y-3 text-sm">
            <div>
              <strong>User:</strong> {device.loggedInUser || "—"}
            </div>
            <div>
              <strong>OS:</strong> {device.osName} {device.osVersion || ""}
            </div>
            <div>
              <strong>Domain:</strong> {device.domain || "Workgroup"}
            </div>
            {device.cpu && (
              <>
                <div>
                  <strong>CPU:</strong> {device.cpu.model}
                </div>
                <div className="text-slate-600 ml-4">
                  {device.cpu.cores} cores / {device.cpu.threads} threads @
                  {device.cpu.clockSpeedMhz} MHz
                </div>
              </>
            )}
            {device.motherboard && (
              <div>
                <strong>Motherboard:</strong> {device.motherboard.manufacturer}{" "}
                {device.motherboard.model}
              </div>
            )}
            {device.ramModules?.length > 0 && (
              <div>
                <strong>RAM:</strong>{" "}
                {device.ramModules.reduce((sum: number, r: any) => sum + r.capacityGb, 0)} GB
              </div>
            )}
          </div>
        </div>

        {/* Disks */}
        {device.disks?.length > 0 && (
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Storage</h2>
            <div className="space-y-3">
              {device.disks.map((disk: any, i: number) => (
                <div key={i} className="text-sm border-b pb-2">
                  <div className="font-medium">
                    {disk.type} - {disk.totalSpaceGb} GB
                  </div>
                  <div className="text-slate-600">
                    Free: {disk.freeSpaceGb} GB ({((disk.freeSpaceGb / disk.totalSpaceGb) * 100).toFixed(1)}%)
                  </div>
                  {disk.serialNumber && (
                    <div className="text-xs text-slate-500">S/N: {disk.serialNumber}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <section className="mt-6 rounded bg-white p-6 shadow">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Device Components</h2>
            <p className="mt-1 text-sm text-slate-500">
              Track monitors, peripherals, and any custom hardware assigned to this device.
            </p>
          </div>
        </div>

        {componentError && (
          <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {componentError}
          </p>
        )}

        <form
          onSubmit={saveComponent}
          className="mb-6 grid grid-cols-1 gap-4 rounded border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <label className="text-sm font-medium text-slate-700">
            Component type
            <select
              value={components.category}
              onChange={(event) => changeComponentCategory(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
            >
              <option>Screen</option>
              <option>Mouse</option>
              <option>Keyboard</option>
              <option>Custom</option>
            </select>
          </label>

          {components.category === "Custom" && (
            <label className="text-sm font-medium text-slate-700">
              Custom component type
              <input
                required
                maxLength={80}
                value={components.customCategory}
                onChange={(event) =>
                  setComponents({ ...components, customCategory: event.target.value })
                }
                placeholder="e.g. Headset"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
              />
            </label>
          )}

          <label className="text-sm font-medium text-slate-700">
            Component name
            <input
              required
              maxLength={120}
              value={components.name}
              onChange={(event) =>
                setComponents({ ...components, name: event.target.value })
              }
              placeholder="e.g. IPS display"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
            />
          </label>

          {components.category !== "Custom" &&
            COMPONENT_SPECIFICATION_FIELDS[components.category]?.map((field) => (
              <label
                key={field.key}
                className="text-sm font-medium text-slate-700"
              >
                {field.label}
                <input
                  type={field.type ?? "text"}
                  min={field.type === "number" ? 0 : undefined}
                  step={field.key === "refreshRateHz" ? "1" : undefined}
                  maxLength={field.type === "number" ? undefined : 500}
                  value={components.specifications[field.key] ?? ""}
                  onChange={(event) =>
                    updateSpecification(field.key, event.target.value)
                  }
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
                />
              </label>
            ))}

          <label className="text-sm font-medium text-slate-700">
            Manufacturer
            <input
              maxLength={120}
              value={components.manufacturer}
              onChange={(event) =>
                setComponents({ ...components, manufacturer: event.target.value })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Model
            <input
              maxLength={120}
              value={components.model}
              onChange={(event) =>
                setComponents({ ...components, model: event.target.value })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
            />
          </label>

          {isScreenCategory(components.category) && (
            <label className="text-sm font-medium text-slate-700">
              Screen size (inches)
              <input
                type="number"
                min="0"
                step="0.1"
                value={components.sizeInches}
                onChange={(event) =>
                  setComponents({ ...components, sizeInches: event.target.value })
                }
                placeholder="e.g. 24"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
              />
            </label>
          )}

          {components.category === "Custom" && (
            <div className="space-y-3 rounded border border-slate-200 bg-white p-3 md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Custom fields
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Add any specifications for this component.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={components.customSpecifications.length >= 30}
                  onClick={() =>
                    setComponents((current) => ({
                      ...current,
                      customSpecifications: [
                        ...current.customSpecifications,
                        {
                          id: Date.now(),
                          name: "",
                          value: "",
                        },
                      ],
                    }))
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add field
                </button>
              </div>
              {components.customSpecifications.map((field) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"
                >
                  <label className="text-sm font-medium text-slate-700">
                    Field name
                    <input
                      maxLength={80}
                      value={field.name}
                      onChange={(event) =>
                        setComponents((current) => ({
                          ...current,
                          customSpecifications: current.customSpecifications.map(
                            (item) =>
                              item.id === field.id
                                ? { ...item, name: event.target.value }
                                : item,
                          ),
                        }))
                      }
                      placeholder="e.g. Cable length"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Value
                    <input
                      maxLength={500}
                      value={field.value}
                      onChange={(event) =>
                        setComponents((current) => ({
                          ...current,
                          customSpecifications: current.customSpecifications.map(
                            (item) =>
                              item.id === field.id
                                ? { ...item, value: event.target.value }
                                : item,
                          ),
                        }))
                      }
                      placeholder="Enter value"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setComponents((current) => ({
                        ...current,
                        customSpecifications: current.customSpecifications.filter(
                          (item) => item.id !== field.id,
                        ),
                      }))
                    }
                    aria-label="Remove custom field"
                    className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="text-sm font-medium text-slate-700 md:col-span-2 lg:col-span-3">
            Notes
            <textarea
              maxLength={1000}
              value={components.details}
              onChange={(event) =>
                setComponents({ ...components, details: event.target.value })
              }
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal"
            />
          </label>

          <div className="flex gap-2 md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={savingComponent}
              className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {editingComponentId ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {savingComponent
                ? "Saving..."
                : editingComponentId
                  ? "Save changes"
                  : "Add component"}
            </button>
            {editingComponentId && (
              <button
                type="button"
                onClick={resetComponentForm}
                className="inline-flex items-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-white"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            )}
          </div>
        </form>

        {deviceComponents.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {deviceComponents.map((component) => (
              <article
                key={component.id}
                className="rounded border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                      {component.category}
                    </span>
                    <h3 className="mt-2 font-semibold text-slate-900">
                      {component.name}
                    </h3>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => editComponent(component)}
                      aria-label={`Edit ${component.category}: ${component.name}`}
                      className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteComponent(component.id)}
                      aria-label={`Remove ${component.category}: ${component.name}`}
                      className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {component.manufacturer && (
                    <>
                      <dt className="text-slate-500">Manufacturer</dt>
                      <dd>{component.manufacturer}</dd>
                    </>
                  )}
                  {component.model && (
                    <>
                      <dt className="text-slate-500">Model</dt>
                      <dd>{component.model}</dd>
                    </>
                  )}
                  {component.sizeInches != null && (
                    <>
                      <dt className="text-slate-500">Screen size</dt>
                      <dd>{component.sizeInches} in</dd>
                    </>
                  )}
                  {Object.entries(component.specifications ?? {}).map(
                    ([key, value]) => (
                      <Fragment key={key}>
                        <dt className="text-slate-500">
                          {getSpecificationLabel(key)}
                        </dt>
                        <dd>{value}</dd>
                      </Fragment>
                    ),
                  )}
                  {component.details && (
                    <>
                      <dt className="text-slate-500">Notes</dt>
                      <dd className="whitespace-pre-wrap">{component.details}</dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-500">
            No components have been added to this device.
          </p>
        )}

        <div className="mt-8 border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-lg font-semibold">Component History</h3>
          {componentHistory.length ? (
            <ol className="space-y-3">
              {componentHistory.map((entry) => {
                const previousValue = flattenHistoryValue(entry.previousValue);
                const newValue = flattenHistoryValue(entry.newValue);
                const fields = Array.from(
                  new Set([
                    ...Object.keys(previousValue),
                    ...Object.keys(newValue),
                  ]),
                ).filter((field) => {
                  if (entry.action === "UPDATED") {
                    return previousValue[field] !== newValue[field];
                  }
                  const value =
                    entry.action === "ADDED"
                      ? newValue[field]
                      : previousValue[field];
                  return value != null && value !== "";
                });

                return (
                  <li
                    key={entry.id}
                    className="rounded border border-slate-200 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">
                          {entry.action === "ADDED"
                            ? "Added"
                            : entry.action === "UPDATED"
                              ? "Updated"
                              : "Removed"}
                        </span>
                        <span className="ml-2 text-slate-600">{entry.componentName}</span>
                      </div>
                      <time
                        dateTime={entry.changedAt}
                        className="text-xs text-slate-500"
                      >
                        {new Date(entry.changedAt).toLocaleString()}
                      </time>
                    </div>
                    <div className="mt-3 space-y-1 text-slate-600">
                      {fields.map((field) => (
                        <p key={field}>
                          <span className="font-medium text-slate-700">
                            {getHistoryFieldLabel(field)}:
                          </span>{" "}
                          {entry.action === "UPDATED" ? (
                            <>
                              {formatHistoryValue(field, previousValue[field])}{" "}
                              <span aria-hidden="true">→</span>{" "}
                              {formatHistoryValue(field, newValue[field])}
                            </>
                          ) : (
                            formatHistoryValue(
                              field,
                              entry.action === "ADDED"
                                ? newValue[field]
                                : previousValue[field],
                            )
                          )}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">
              Component changes will appear here.
            </p>
          )}
        </div>
      </section>

      {/* Software */}
      <div className="bg-white p-6 rounded shadow mt-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold mb-4">Installed Software</h2>
          <label className="relative block sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={softwareSearch}
              onChange={(event) => setSoftwareSearch(event.target.value)}
              placeholder="Search this device's software..."
              className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </label>
        </div>
        {installedSoftware.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Version</th>
                  <th className="text-left px-4 py-2">Publisher</th>
                </tr>
              </thead>
              <tbody>
                {filteredSoftware.map((sw: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2">{sw.name}</td>
                    <td className="px-4 py-2">{sw.version}</td>
                    <td className="px-4 py-2 text-slate-600">{sw.publisher || "—"}</td>
                  </tr>
                ))}
                {filteredSoftware.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No matching software found on this device.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-slate-500">No software is recorded for this device.</p>
        )}
      </div>
    </div>
  );
}
