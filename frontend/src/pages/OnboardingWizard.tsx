import { useState, useEffect } from "react";
import { adApi, fileServerApi, onboardingApi } from "../lib/api";
import { ChevronRight, ChevronLeft, CheckCircle, AlertCircle } from "lucide-react";

type Step = "employee-info" | "ad-config" | "folder-config" | "review" | "result";

interface EmployeeData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface AdConfig {
  targetOuDn: string;
  managerDn: string;
  groupDns: string[];
}

interface FolderConfig {
  departmentFolderId: string;
}

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>("employee-info");
  const [employeeData, setEmployeeData] = useState<EmployeeData>({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [adConfig, setAdConfig] = useState<AdConfig>({
    targetOuDn: "",
    managerDn: "",
    groupDns: [],
  });
  const [folderConfig, setFolderConfig] = useState<FolderConfig>({
    departmentFolderId: "",
  });

  const [ous, setOus] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  // Load AD/FS data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [ousRes, usersRes, groupsRes, deptsRes] = await Promise.all([
          adApi.listOus(),
          adApi.listUsers(),
          adApi.listGroups(),
          fileServerApi.listDepartments(),
        ]);
        setOus(ousRes.data);
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        setDepartments(deptsRes.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load configuration data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const validateEmployeeInfo = () => {
    const { firstName, lastName, username, email, password, confirmPassword } = employeeData;
    if (!firstName || !lastName || !username || !email) {
      setError("All fields are required");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    return true;
  };

  const validateAdConfig = () => {
    if (!adConfig.targetOuDn) {
      setError("Please select a target OU");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === "employee-info") {
      if (validateEmployeeInfo()) setStep("ad-config");
    } else if (step === "ad-config") {
      if (validateAdConfig()) setStep("folder-config");
    } else if (step === "folder-config") {
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "ad-config") setStep("employee-info");
    else if (step === "folder-config") setStep("ad-config");
    else if (step === "review") setStep("folder-config");
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError("");
      const dto = {
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        username: employeeData.username,
        email: employeeData.email,
        password: employeeData.password,
        targetOuDn: adConfig.targetOuDn,
        managerDn: adConfig.managerDn || undefined,
        departmentFolderId: folderConfig.departmentFolderId || undefined,
        requestedGroupDns: adConfig.groupDns,
      };
      const res = await onboardingApi.start(dto);
      setResult(res.data);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading onboarding wizard...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Employee Onboarding Wizard</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6 flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded shadow p-8">
        {/* Step 1: Employee Info */}
        {step === "employee-info" && (
          <div>
            <h2 className="text-2xl font-semibold mb-6">Employee Information</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-1">First Name *</label>
                <input
                  type="text"
                  value={employeeData.firstName}
                  onChange={(e) => setEmployeeData({ ...employeeData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name *</label>
                <input
                  type="text"
                  value={employeeData.lastName}
                  onChange={(e) => setEmployeeData({ ...employeeData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Username (sAMAccountName) *</label>
                <input
                  type="text"
                  value={employeeData.username}
                  onChange={(e) => setEmployeeData({ ...employeeData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input
                  type="email"
                  value={employeeData.email}
                  onChange={(e) => setEmployeeData({ ...employeeData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password *</label>
                <input
                  type="password"
                  value={employeeData.password}
                  onChange={(e) => setEmployeeData({ ...employeeData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm Password *</label>
                <input
                  type="password"
                  value={employeeData.confirmPassword}
                  onChange={(e) =>
                    setEmployeeData({ ...employeeData, confirmPassword: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: AD Config */}
        {step === "ad-config" && (
          <div>
            <h2 className="text-2xl font-semibold mb-6">Active Directory Configuration</h2>
            <div className="space-y-6 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-2">Target OU *</label>
                <select
                  value={adConfig.targetOuDn}
                  onChange={(e) => setAdConfig({ ...adConfig, targetOuDn: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an OU...</option>
                  {ous.map((ou) => (
                    <option key={ou.id} value={ou.distinguishedName}>
                      {ou.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Manager</label>
                <select
                  value={adConfig.managerDn}
                  onChange={(e) => setAdConfig({ ...adConfig, managerDn: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (optional)</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.distinguishedName}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Groups</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-3">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={adConfig.groupDns.includes(group.distinguishedName)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAdConfig({
                              ...adConfig,
                              groupDns: [...adConfig.groupDns, group.distinguishedName],
                            });
                          } else {
                            setAdConfig({
                              ...adConfig,
                              groupDns: adConfig.groupDns.filter((g) => g !== group.distinguishedName),
                            });
                          }
                        }}
                        className="rounded"
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Folder Config */}
        {step === "folder-config" && (
          <div>
            <h2 className="text-2xl font-semibold mb-6">File Server Configuration</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium mb-2">Department Folder</label>
                <select
                  value={folderConfig.departmentFolderId}
                  onChange={(e) => setFolderConfig({ departmentFolderId: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (optional)</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-slate-600">
                ℹ️ A personal folder will be created inside the selected department folder with
                automatic NTFS permissions.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === "review" && (
          <div>
            <h2 className="text-2xl font-semibold mb-6">Review & Confirm</h2>
            <div className="space-y-4 max-w-2xl text-sm">
              <div className="bg-slate-50 p-4 rounded">
                <strong>Employee:</strong> {employeeData.firstName} {employeeData.lastName} (
                {employeeData.username})
              </div>
              <div className="bg-slate-50 p-4 rounded">
                <strong>Email:</strong> {employeeData.email}
              </div>
              <div className="bg-slate-50 p-4 rounded">
                <strong>Target OU:</strong> {adConfig.targetOuDn}
              </div>
              {adConfig.managerDn && (
                <div className="bg-slate-50 p-4 rounded">
                  <strong>Manager:</strong>{" "}
                  {users.find((u) => u.distinguishedName === adConfig.managerDn)?.firstName}{" "}
                  {users.find((u) => u.distinguishedName === adConfig.managerDn)?.lastName}
                </div>
              )}
              {adConfig.groupDns.length > 0 && (
                <div className="bg-slate-50 p-4 rounded">
                  <strong>Groups:</strong> {adConfig.groupDns.length} group(s)
                </div>
              )}
              {folderConfig.departmentFolderId && (
                <div className="bg-slate-50 p-4 rounded">
                  <strong>Department Folder:</strong>{" "}
                  {departments.find((d) => d.id === folderConfig.departmentFolderId)?.name}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Result */}
        {step === "result" && (
          <div className="text-center">
            {result?.status === "ok" || result?.status ? (
              <div>
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-green-600 mb-2">Onboarding Started</h2>
                <p className="text-slate-600 mb-6">
                  Request ID: <strong>{result?.id || result?.requestId}</strong>
                </p>
                <p className="text-slate-600 mb-6">
                  The employee provisioning workflow has been initiated. You can track the progress
                  in the onboarding requests list.
                </p>
                <button
                  onClick={() => {
                    setStep("employee-info");
                    setEmployeeData({
                      firstName: "",
                      lastName: "",
                      username: "",
                      email: "",
                      password: "",
                      confirmPassword: "",
                    });
                    setAdConfig({ targetOuDn: "", managerDn: "", groupDns: [] });
                    setFolderConfig({ departmentFolderId: "" });
                  }}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Start Another Onboarding
                </button>
              </div>
            ) : (
              <div>
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-red-600 mb-2">Onboarding Failed</h2>
                <p className="text-slate-600 mb-6">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {step !== "result" && (
          <div className="flex gap-3 mt-8 justify-end">
            {step !== "employee-info" && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-6 py-2 border rounded hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step !== "review" && (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === "review" && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-400"
              >
                {submitting ? "Processing..." : "Start Onboarding"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
