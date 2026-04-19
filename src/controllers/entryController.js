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

    // ✅ Validate input FIRST
    if (!month || !year) {
      return res.status(400).json({
        message: "Month and year are required",
      });
    }

    month = parseInt(month);
    year = parseInt(year);

    // ✅ Check NaN
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

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      totalCups += e.cup_count;
      totalAmount += e.cup_count * price;
    });

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tea-report-${month}-${year}.pdf`,
    );

    doc.pipe(res);

    doc.fontSize(18).text("Tea Counter Report", { align: "center" });
    doc.moveDown();

    doc.text(`Month: ${month}/${year}`);
    doc.text(`Total Cups: ${totalCups}`);
    doc.text(`Total Entries: ${entries.length}`);
    doc.text(`Total Amount: ${totalAmount}`);

    doc.moveDown();
    // doc.text("---------------------------------------------");

    const tableTop = 200;

    doc.font("Helvetica-Bold");
    doc.text("Date", 50, tableTop);
    doc.text("Time", 180, tableTop);
    doc.text("Cups", 300, tableTop);
    doc.text("Price", 380, tableTop);
    doc.text("Total", 460, tableTop);

    doc.font("Helvetica");

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let y = tableTop + 30;

    entries.forEach((e) => {
      const price = e.price_per_cup || 0;
      const rowTotal = e.cup_count * price;

      doc.text(e.date, 50, y);
      doc.text(e.time, 180, y);
      doc.text(String(e.cup_count), 300, y);
      doc.text(String(price), 380, y);
      doc.text(String(rowTotal), 460, y);

      y += 20;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    y += 20;

    doc.moveTo(50, y).lineTo(550, y).stroke();

    y += 15;

    doc.font("Helvetica-Bold");
    doc.text("Grand Total:", 350, y);
    doc.text(`${totalAmount}`, 460, y);

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
