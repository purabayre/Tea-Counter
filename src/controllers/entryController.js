const TeaEntry = require("../models/TeaEntry");
const TeaPrice = require("../models/TeaPrice");
const { getDateTimeDetails } = require("../utils/dateHelper");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const addEntry = async (req, res) => {
  try {
    const { cup_count, date } = req.body;

    if (!cup_count || !Number.isInteger(cup_count) || cup_count <= 0) {
      return res.status(400).json({
        message: "Valid cup count is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        message: "Date is required",
      });
    }

    const manualDate = new Date(date);

    if (isNaN(manualDate.getTime())) {
      return res.status(400).json({
        message: "Invalid date format",
      });
    }

    const now = new Date();
    const time = now.toLocaleTimeString("en-IN");

    const priceDoc = await TeaPrice.findOne().sort({ effective_from: -1 });

    if (!priceDoc) {
      return res.status(400).json({ message: "No price found in DB" });
    }

    const currentPrice = priceDoc.price_per_cup;
    const total = cup_count * currentPrice;

    const newEntry = new TeaEntry({
      cup_count,
      price_per_cup: currentPrice,
      total,

      date_time: manualDate,
      date: manualDate,
      time,

      month: manualDate.getMonth() + 1,
      year: manualDate.getFullYear(),
    });

    const saved = await newEntry.save();

    res.status(201).json({
      message: "Entry added successfully",
      data: saved,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const getTodayEntries = async (req, res) => {
  try {
    const now = new Date();

    // Start of today (IST-safe)
    const start = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
    );

    // End of today (IST-safe)
    const end = new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const entries = await TeaEntry.find({
      date_time: {
        $gte: start,
        $lte: end,
      },
    }).sort({ date_time: 1 });

    let totalCups = 0;
    let totalAmount = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      totalCups += e.cup_count || 0;
      totalAmount += (e.cup_count || 0) * price;
    });

    res.json({
      date: now
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(/ /g, "-"), // 21-Apr-2026
      totalCups,
      totalAmount,
      totalEntries: entries.length,
      entries,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
const getMonthlyEntries = async (req, res) => {
  try {
    let { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month & year required" });
    }

    month = parseInt(month);
    year = parseInt(year);

    const priceDoc = await TeaPrice.findOne().sort({ effective_from: -1 });

    const currentPrice = priceDoc ? priceDoc.price_per_cup : 0;

    const entries = await TeaEntry.find({ month, year }).sort({
      date_time: 1,
    });

    let totalCups = 0;
    let totalAmount = 0;

    entries.forEach((e) => {
      totalCups += e.cup_count;
      totalAmount += e.cup_count * currentPrice;
    });

    res.json({
      month,
      year,
      totalCups,
      currentPrice,
      totalAmount,
      totalEntries: entries.length,
      entries,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
const updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { cup_count } = req.body;

    if (!Number.isInteger(cup_count) || cup_count <= 0) {
      return res.status(400).json({ message: "Invalid cup count" });
    }

    const entry = await TeaEntry.findById(id);

    if (!entry) return res.status(404).json({ message: "Not found" });

    const { month: cm, year: cy } = getDateTimeDetails();

    if (entry.year < cy || (entry.year === cy && entry.month < cm)) {
      return res.status(403).json({
        message: "Cannot edit past month entries",
      });
    }

    entry.cup_count = cup_count;
    entry.total = cup_count * (entry.price_per_cup || 0);

    const updated = await entry.save();

    res.json({
      message: "Updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await TeaEntry.findById(id);

    if (!entry) return res.status(404).json({ message: "Not found" });

    const { month: cm, year: cy } = getDateTimeDetails();

    if (entry.year < cy || (entry.year === cy && entry.month < cm)) {
      return res.status(403).json({
        message: "Cannot delete past month entries",
      });
    }

    await entry.deleteOne();

    res.json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const exportMonthlySummary = async (req, res) => {
  try {
    let { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    month = parseInt(month);
    year = parseInt(year);

    if (isNaN(month) || isNaN(year)) {
      return res.status(400).json({
        message: "Invalid month or year",
      });
    }

    const entries = await TeaEntry.find({ month, year });

    let totalCups = 0;
    let totalAmount = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      totalCups += e.cup_count;
      totalAmount += e.cup_count * price;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Summary");

    sheet.addRow([`Tea Summary - ${month}/${year}`]);
    sheet.addRow([]);
    sheet.addRow(["Total Cups", totalCups]);
    sheet.addRow(["Total Entries", entries.length]);
    sheet.addRow(["Total Amount", totalAmount]);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tea-summary-${month}-${year}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const exportMonthlyEntries = async (req, res) => {
  try {
    let { month, year } = req.query;

    month = Number(month);
    year = Number(year);

    // ✅ Validation
    if (
      !month ||
      !year ||
      isNaN(month) ||
      isNaN(year) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required",
      });
    }

    // ✅ Month date range
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await TeaEntry.find({
      date_time: { $gte: start, $lte: end },
    }).sort({ date_time: 1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Entries");

    sheet.addRow(["Date", "Time", "Cups", "Price", "Total"]);

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      const cups = e.cup_count || 0;
      const total = cups * price;

      sheet.addRow([e.date || "-", e.time || "-", cups, price, total]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tea-entries-${month}-${year}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel Export Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const exportMonthlyPDF = async (req, res) => {
  try {
    let { month, year } = req.query;

    month = Number(month);
    year = Number(year);

    // ✅ Validation
    if (
      !month ||
      !year ||
      isNaN(month) ||
      isNaN(year) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({
        message: "Valid month (1-12) and year required",
      });
    }

    // ✅ Month date range
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await TeaEntry.find({
      date_time: { $gte: start, $lte: end },
    }).sort({ date_time: 1 });

    let totalCups = 0;
    let totalAmount = 0;
    let pricePerCup = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      const cups = e.cup_count || 0;

      pricePerCup = price;
      totalCups += cups;
      totalAmount += cups * price;
    });

    const monthName = new Date(year, month - 1).toLocaleString("en-IN", {
      month: "long",
    });

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tea-report-${month}-${year}.pdf`,
    );

    doc.pipe(res);

    doc.fontSize(22).fillColor("#6B3F1D").text("Tea Counter Report");

    doc.moveDown();

    doc.fillColor("black").fontSize(12);

    doc.text(`Month: ${monthName} ${year}`);
    doc.moveDown(0.5);
    doc.text(`Total Cups: ${totalCups}`);
    doc.moveDown(0.5);
    doc.text(`Price per Cup: ${pricePerCup}`);
    doc.moveDown(0.5);

    doc.fontSize(14).fillColor("#0E9F6E").text(`Total Amount: ${totalAmount}`);

    doc.moveDown(2);

    const tableTop = doc.y;

    doc.fillColor("#6B3F1D").font("Helvetica-Bold");

    doc.text("DATE", 50, tableTop);
    doc.text("TIME", 250, tableTop);
    doc.text("CUPS", 450, tableTop);

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    doc.font("Helvetica").fillColor("black");

    let y = tableTop + 25;

    entries.forEach((e) => {
      const dateObj = new Date(e.date_time);

      // ✅ Format: 20-Apr-2026
      const formattedDate = dateObj
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(/ /g, "-");

      // ✅ Format: 05:49 pm
      const formattedTime = dateObj
        .toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase();

      doc.text(formattedDate, 50, y);
      doc.text(formattedTime, 250, y);
      doc.text(String(e.cup_count || 0), 450, y);

      y += 20;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc.end();
  } catch (error) {
    console.error("PDF Export Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addEntry,
  getTodayEntries,
  getMonthlyEntries,
  updateEntry,
  deleteEntry,
  exportMonthlySummary,
  exportMonthlyEntries,
  exportMonthlyPDF,
};
