const TeaEntry = require("../models/TeaEntry");
const TeaPrice = require("../models/TeaPrice");
const { getDateTimeDetails } = require("../utils/dateHelper");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

// ==============================
// ADD ENTRY
// ==============================
const addEntry = async (req, res) => {
  try {
    const { cup_count } = req.body;

    if (!cup_count || !Number.isInteger(cup_count) || cup_count <= 0) {
      return res.status(400).json({
        message: "Valid cup count is required",
      });
    }

    const { date_time, date, time, month, year } = getDateTimeDetails();

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
      date_time,
      date,
      time,
      month,
      year,
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
    const { date } = getDateTimeDetails();

    const entries = await TeaEntry.find({ date }).sort({ date_time: 1 });

    let totalCups = 0;
    let totalAmount = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      totalCups += e.cup_count;
      totalAmount += e.cup_count * price;
    });

    res.json({
      date,
      totalCups,
      totalAmount,
      totalEntries: entries.length,
      entries,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ==============================
// MONTHLY ENTRIES
// ==============================
const getMonthlyEntries = async (req, res) => {
  try {
    let { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month & year required" });
    }

    month = parseInt(month);
    year = parseInt(year);
    const priceDoc = await TeaPrice.findOne().sort({ effective_from: -1 });

    const currentPrice = priceDoc.price_per_cup;

    const entries = await TeaEntry.find({ month, year }).sort({
      date_time: 1,
    });

    let totalCups = 0;
    let totalAmount = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      totalCups += e.cup_count;
      totalAmount += e.cup_count * price;
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

// ==============================
// UPDATE ENTRY
// ==============================
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

// ==============================
// DELETE ENTRY
// ==============================
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

// ==============================
// EXCEL SUMMARY EXPORT
// ==============================
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

// ==============================
// EXCEL ENTRIES EXPORT
// ==============================
const exportMonthlyEntries = async (req, res) => {
  try {
    let { month, year } = req.query;

    month = parseInt(month);
    year = parseInt(year);

    const entries = await TeaEntry.find({ month, year }).sort({
      date_time: 1,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Entries");

    sheet.addRow(["Date", "Time", "Cups", "Price", "Total"]);

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      const total = e.cup_count * price;

      sheet.addRow([e.date, e.time, e.cup_count, price, total]);
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
    res.status(500).json({ message: "Server error" });
  }
};

// ==============================
// PDF EXPORT
// ==============================
const exportMonthlyPDF = async (req, res) => {
  try {
    let { month, year } = req.query;

    month = parseInt(month);
    year = parseInt(year);

    const entries = await TeaEntry.find({ month, year }).sort({
      date_time: 1,
    });

    let totalCups = 0;
    let totalAmount = 0;
    let pricePerCup = 0;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      pricePerCup = price; // assume same price for report
      totalCups += e.cup_count;
      totalAmount += e.cup_count * price;
    });

    // Convert month number → name
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

    // ================= HEADER =================
    doc
      .fontSize(22)
      .fillColor("#6B3F1D") // brown
      .text("Tea Counter Report");

    doc.moveDown();

    doc.fillColor("black").fontSize(12);

    doc.text(`Month: ${monthName} ${year}`);
    doc.moveDown(0.5);
    doc.text(`Total Cups: ${totalCups}`);
    doc.moveDown(0.5);
    doc.text(`Price per Cup: ${pricePerCup}`);
    doc.moveDown(0.5);

    doc
      .fontSize(14)
      .fillColor("#0E9F6E") // green
      .text(`Total Amount: ${totalAmount}`);

    doc.moveDown(2);

    // ================= TABLE HEADER =================
    const tableTop = doc.y;

    doc.fillColor("#6B3F1D").font("Helvetica-Bold");

    doc.text("DATE", 50, tableTop);
    doc.text("TIME", 250, tableTop);
    doc.text("CUPS", 450, tableTop);

    // line under header
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    doc.font("Helvetica").fillColor("black");

    let y = tableTop + 25;

    // ================= TABLE ROWS =================
    entries.forEach((e) => {
      doc.text(e.date, 50, y);
      doc.text(e.time, 250, y);
      doc.text(String(e.cup_count), 450, y);

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
