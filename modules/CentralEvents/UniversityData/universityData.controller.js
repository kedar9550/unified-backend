const universityDataService = require('./universityData.service');

class UniversityDataController {
  async getForms(req, res, next) {
    try {
      const registry = universityDataService.getFormsRegistry();
      return res.status(200).json({
        success: true,
        data: registry,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFormByCode(req, res, next) {
    try {
      const { code } = req.params;
      const form = universityDataService.getFormByCode(code);
      return res.status(200).json({
        success: true,
        data: form,
      });
    } catch (error) {
      next(error);
    }
  }

  async createRecord(req, res, next) {
    try {
      const { code } = req.params;
      const result = await universityDataService.createRecord(code, req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Record created successfully',
        data: result,
      });
    } catch (error) {
      if (error.statusCode === 400 && error.errors) {
        return res.status(400).json({
          success: false,
          message: error.message,
          errors: error.errors,
        });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }

  async listRecords(req, res, next) {
    try {
      const { code } = req.params;
      const result = await universityDataService.listRecords(code, req.query, req.user);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecordById(req, res, next) {
    try {
      const { code, id } = req.params;
      const record = await universityDataService.getRecordById(code, id);
      return res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRecord(req, res, next) {
    try {
      const { code, id } = req.params;
      const updated = await universityDataService.updateRecord(code, id, req.body, req.user);
      return res.status(200).json({
        success: true,
        message: 'Record updated successfully',
        data: updated,
      });
    } catch (error) {
      if (error.statusCode === 400 && error.errors) {
        return res.status(400).json({
          success: false,
          message: error.message,
          errors: error.errors,
        });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }

  async deleteRecord(req, res, next) {
    try {
      const { code, id } = req.params;
      const result = await universityDataService.deleteRecord(code, id, req.user);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFormTypes(req, res, next) {
    try {
      const formTypes = await universityDataService.getFormTypes(req.query);
      return res.status(200).json({
        success: true,
        data: formTypes,
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleFormTypeStatus(req, res, next) {
    try {
      const { code } = req.params;
      const result = await universityDataService.toggleFormTypeStatus(code);
      return res.status(200).json({
        success: true,
        message: `Form status updated`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async createFormType(req, res, next) {
    try {
      const result = await universityDataService.createFormType(req.body);
      return res.status(201).json({
        success: true,
        message: 'Form type created successfully',
        data: result,
      });
    } catch (error) {
      if (error.statusCode === 409) {
        return res.status(409).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async updateFormType(req, res, next) {
    try {
      const { code } = req.params;
      const result = await universityDataService.updateFormType(code, req.body);
      return res.status(200).json({
        success: true,
        message: 'Form type updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFormType(code, req, res, next) {
    try {
      const { code } = req.params;
      const result = await universityDataService.deleteFormType(code);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UniversityDataController();

