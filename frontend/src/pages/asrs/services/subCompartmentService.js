import { subcompartmentsAPI } from './api';

const SubCompartmentService = {
  // Get all subcompartments
  getAllSubCompartments: async () => {
    try {
      const response = await subcompartmentsAPI.getAll();
      return response.data;
    } catch (error) {
      console.error('Error fetching subcompartments:', error);
      throw error;
    }
  },

  // Get subcompartment by place
  getSubCompartmentByPlace: async (place) => {
    try {
      const response = await subcompartmentsAPI.getByPlace(place);
      return response.data;
    } catch (error) {
      console.error(`Error fetching subcompartment ${place}:`, error);
      throw error;
    }
  },

  // Create new subcompartment
  createSubCompartment: async (subcomData) => {
    try {
      const response = await subcompartmentsAPI.create(subcomData);
      return response.data;
    } catch (error) {
      console.error('Error creating subcompartment:', error);
      throw error;
    }
  },

  // Update subcompartment status
  updateStatus: async (place, statusData) => {
    try {
      const response = await subcompartmentsAPI.updateStatus(place, statusData);
      return response.data;
    } catch (error) {
      console.error(`Error updating status for ${place}:`, error);
      throw error;
    }
  },

  // Delete subcompartment
  deleteSubCompartment: async (place) => {
    try {
      const response = await subcompartmentsAPI.delete(place);
      return response.data;
    } catch (error) {
      console.error(`Error deleting subcompartment ${place}:`, error);
      throw error;
    }
  },

  // Add product operation
  addProduct: async (productData) => {
    try {
      const response = await subcompartmentsAPI.addProduct(productData);
      return response.data;
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  },

  // Retrieve product operation
  retrieveProduct: async (retrieveData) => {
    try {
      const response = await subcompartmentsAPI.retrieveProduct(retrieveData);
      return response.data;
    } catch (error) {
      console.error('Error retrieving product:', error);
      throw error;
    }
  }
};

export default SubCompartmentService;
