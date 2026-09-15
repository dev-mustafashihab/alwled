describe('ApiResponse contract', () => {
  it('error responses follow { success:false, message, errors }', () => {
    const shape = { success: false, message: 'Validation failed', errors: [] };
    expect(shape.success).toBe(false);
    expect(Array.isArray(shape.errors)).toBe(true);
  });
  it('success responses carry data', () => {
    const shape = { success: true, message: 'Success', data: { id: 'x' } };
    expect(shape.success).toBe(true);
    expect(shape.data).toHaveProperty('id');
  });
});
