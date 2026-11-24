using System.Globalization;
using System.Runtime.InteropServices;
using System.Management;
using System.Net.NetworkInformation;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;

namespace ITAM.WindowsAgent;

public sealed class DeviceInventoryCollector
{
    private readonly ILogger<DeviceInventoryCollector> _logger;

    public DeviceInventoryCollector(ILogger<DeviceInventoryCollector> logger)
    {
        _logger = logger;
    }

    public AgentIdentity CollectIdentity(string agentVersion)
    {
        var system = First("SELECT UserName, Domain FROM Win32_ComputerSystem");
        var macAddresses = NetworkInterface.GetAllNetworkInterfaces()
            .Where(adapter =>
                adapter.OperationalStatus == OperationalStatus.Up &&
                adapter.NetworkInterfaceType is not NetworkInterfaceType.Loopback and not NetworkInterfaceType.Tunnel)
            .Select(adapter => adapter.GetPhysicalAddress().ToString())
            .Where(address => address.Length == 12 && address.Any(character => character != '0'))
            .Select(address => string.Join(':', Enumerable.Range(0, 6).Select(index => address.Substring(index * 2, 2))).ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        using var osKey = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
        var osName = osKey?.GetValue("ProductName") as string ?? "Windows";
        var displayVersion = osKey?.GetValue("DisplayVersion") as string;
        var build = osKey?.GetValue("CurrentBuildNumber") as string;
        var osVersion = string.Join(" ", new[] { displayVersion, build }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return new AgentIdentity(
            Environment.MachineName,
            Text(system, "UserName"),
            Text(system, "Domain"),
            osName,
            string.IsNullOrWhiteSpace(osVersion) ? Environment.OSVersion.Version.ToString() : osVersion,
            agentVersion,
            macAddresses);
    }

    public AgentSnapshot CollectInventory(string agentVersion)
    {
        var identity = CollectIdentity(agentVersion);
        var system = First("SELECT PCSystemType FROM Win32_ComputerSystem");
        var processor = First("SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, Architecture FROM Win32_Processor");
        var board = First("SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard");
        var cpuName = Text(processor, "Name") ?? "Unknown processor";
        var cpuCores = Number(processor, "NumberOfCores", 0);
        var cpuThreads = Number(processor, "NumberOfLogicalProcessors", cpuCores);
        var architecture = Number(processor, "Architecture", 9) switch
        {
            0 => "x86",
            5 => "arm",
            9 => "x86_64",
            12 => "arm64",
            _ => "unknown",
        };

        var memoryModules = Query("SELECT Capacity, Speed, SerialNumber, DeviceLocator FROM Win32_PhysicalMemory")
            .Select(module => new
            {
                capacityGb = Math.Round(Number64(module, "Capacity") / 1024d / 1024d / 1024d, 2),
                speedMhz = Number(module, "Speed", 0),
                serialNumber = Text(module, "SerialNumber"),
                slot = Text(module, "DeviceLocator"),
            })
            .ToArray();

        var physicalDisks = Query("SELECT DeviceID, Model, SerialNumber, Size, MediaType, InterfaceType FROM Win32_DiskDrive")
            .Select(disk =>
            {
                var freeBytes = Associated(disk, "Win32_DiskDriveToDiskPartition")
                    .SelectMany(partition => Associated(partition, "Win32_LogicalDiskToPartition"))
                    .GroupBy(volume => Text(volume, "DeviceID"), StringComparer.OrdinalIgnoreCase)
                    .Select(group => group.First())
                    .Sum(volume => Number64(volume, "FreeSpace"));
                var model = Text(disk, "Model") ?? "";
                var mediaType = Text(disk, "MediaType") ?? "";
                var interfaceType = Text(disk, "InterfaceType") ?? "";

                return new
                {
                    type = GetDiskType(model, mediaType, interfaceType),
                    serialNumber = Text(disk, "SerialNumber"),
                    totalSpaceGb = Math.Round(Number64(disk, "Size") / 1024d / 1024d / 1024d, 2),
                    freeSpaceGb = Math.Round(freeBytes / 1024d / 1024d / 1024d, 2),
                };
            })
            .ToArray();

        using var osKey = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
        var osBuild = osKey?.GetValue("CurrentBuildNumber") as string;
        var snapshot = new
        {
            computerName = identity.ComputerName,
            loggedInUser = identity.LoggedInUser,
            osName = identity.OsName,
            osVersion = identity.OsVersion,
            osBuild,
            domain = identity.Domain,
            formFactor = GetFormFactor(system),
            cpu = new
            {
                model = cpuName,
                cores = cpuCores,
                threads = cpuThreads,
                clockSpeedMhz = Number(processor, "MaxClockSpeed", 0),
                architecture,
            },
            motherboard = new
            {
                manufacturer = Text(board, "Manufacturer") ?? "Unknown",
                model = Text(board, "Product") ?? "Unknown",
                serialNumber = Text(board, "SerialNumber"),
            },
            ramModules = memoryModules,
            disks = physicalDisks,
            software = ReadInstalledSoftware(),
        };

        return new AgentSnapshot(identity, snapshot);
    }

    private static object[] ReadInstalledSoftware()
    {
        var entries = new List<object>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var paths = new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        };

        foreach (var path in paths)
        {
            using var key = Registry.LocalMachine.OpenSubKey(path);
            if (key is null) continue;
            foreach (var subKeyName in key.GetSubKeyNames())
            {
                using var subKey = key.OpenSubKey(subKeyName);
                var name = subKey?.GetValue("DisplayName") as string;
                if (string.IsNullOrWhiteSpace(name)) continue;
                var version = subKey?.GetValue("DisplayVersion") as string ?? "";
                var publisher = subKey?.GetValue("Publisher") as string;
                var identity = $"{name.Trim()}\0{version}\0{publisher}";
                if (!seen.Add(identity)) continue;
                entries.Add(new
                {
                    name = name.Trim(),
                    version,
                    publisher,
                    installDate = ParseRegistryDate(subKey?.GetValue("InstallDate") as string),
                });
            }
        }

        return entries.Take(500).ToArray();
    }

    private IReadOnlyList<IReadOnlyDictionary<string, string?>> Associated(
        IReadOnlyDictionary<string, string?> item,
        string association)
    {
        var path = Text(item, "__PATH");
        return string.IsNullOrWhiteSpace(path)
            ? []
            : Query($"ASSOCIATORS OF {{{path}}} WHERE AssocClass = {association}");
    }

    private string GetFormFactor(IReadOnlyDictionary<string, string?>? system)
    {
        var chassisTypes = Query("SELECT ChassisTypes FROM Win32_SystemEnclosure")
            .SelectMany(enclosure => (Text(enclosure, "ChassisTypes") ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(value => int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var type)
                ? type
                : 0)
            .ToHashSet();

        if (chassisTypes.Overlaps([8, 9, 10, 14, 30, 31, 32])) return "LAPTOP";
        if (chassisTypes.Overlaps([3, 4, 5, 6, 7, 15, 16, 24, 35])) return "PC";

        return Number(system, "PCSystemType", 0) switch
        {
            1 or 3 or 6 => "PC",
            2 => "LAPTOP",
            _ => "UNKNOWN",
        };
    }

    private static string GetDiskType(string model, string mediaType, string interfaceType)
    {
        if (model.Contains("NVME", StringComparison.OrdinalIgnoreCase) ||
            interfaceType.Contains("NVME", StringComparison.OrdinalIgnoreCase))
        {
            return "NVME";
        }

        if (model.Contains("SSD", StringComparison.OrdinalIgnoreCase) ||
            mediaType.Contains("solid state", StringComparison.OrdinalIgnoreCase))
        {
            return "SSD";
        }

        return string.IsNullOrWhiteSpace(model) ? "UNKNOWN" : "HDD";
    }

    private static string? ParseRegistryDate(string? value) =>
        DateTime.TryParseExact(value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;

    private IReadOnlyDictionary<string, string?>? First(string query) => Query(query).FirstOrDefault();

    private IReadOnlyList<IReadOnlyDictionary<string, string?>> Query(string query)
    {
        var rows = new List<IReadOnlyDictionary<string, string?>>();
        try
        {
            using var searcher = new ManagementObjectSearcher(query);
            using var results = searcher.Get();
            foreach (ManagementObject item in results)
            {
                using (item)
                {
                    var row = item.Properties
                        .Cast<PropertyData>()
                        .ToDictionary(
                            property => property.Name,
                            property => property.Value switch
                            {
                                Array values => string.Join(",", values.Cast<object>()),
                                null => null,
                                var value => value.ToString(),
                            });
                    row["__PATH"] = item.Path.Path;
                    rows.Add(row);
                }
            }
        }
        catch (ManagementException exception)
        {
            _logger.LogWarning(exception, "WMI query failed; continuing with partial inventory. Query: {Query}", query);
        }
        catch (InvalidOperationException exception)
        {
            _logger.LogWarning(exception, "WMI returned an invalid object; continuing with partial inventory. Query: {Query}", query);
        }
        catch (COMException exception)
        {
            _logger.LogWarning(exception, "WMI provider is unavailable; continuing with partial inventory. Query: {Query}", query);
        }
        catch (UnauthorizedAccessException exception)
        {
            _logger.LogWarning(exception, "WMI access was denied; continuing with partial inventory. Query: {Query}", query);
        }

        return rows;
    }

    private static string? Text(IReadOnlyDictionary<string, string?>? item, string property) =>
        item is not null && item.TryGetValue(property, out var value) ? value?.Trim() : null;

    private static int Number(IReadOnlyDictionary<string, string?>? item, string property, int fallback) =>
        int.TryParse(Text(item, property), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : fallback;

    private static double Number64(IReadOnlyDictionary<string, string?> item, string property) =>
        double.TryParse(Text(item, property), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            ? value
            : 0;
}

public sealed record AgentIdentity(
    string ComputerName,
    string? LoggedInUser,
    string? Domain,
    string OsName,
    string OsVersion,
    string AgentVersion,
    string[] MacAddresses);

public sealed record AgentSnapshot(AgentIdentity Identity, object Snapshot);
