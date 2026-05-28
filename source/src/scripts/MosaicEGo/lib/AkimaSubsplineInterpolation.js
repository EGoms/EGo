/*
* Akima subspline interpolation algorithm.
*
* References
* ----------
*
* Hiroshi Akima, A new method of interpolation and smooth curve fitting based
* on local procedures, Journal of the ACM, Vol. 17, No. 4, October 1970,
* pages 589-602.
*
* Implementation
* --------------
*
* Our implementation is based on the book:
*
* Numerical Algorithms with C, by G. Engeln-Mullges and F. Uhlig (Springer,
* 1996), section 13.1.
*
* We properly represent corners when a data point lies between two adjacent
* straight lines with different slopes. This means that our implementation
* does not impose continuous differentiability, which deviates from the
* original work by Akima. Supporting the accurate representation of corners
* has several practical advantages in our opinion; one of them is the enhanced
* flexibility for the application of Akima interpolation to graphical
* representations of curves given by a set of prescribed x,y data points.
*
* Parameters
* ----------
*
* x  Vector of x-values:
*
*    - If x is not empty: Must be a vector of monotonically increasing,
*      distinct values: x[0] < x[1] < ... < x[n-1].
*
*    - If x is empty: The interpolation will use implicit x[i] = i for
*      i = {0,1,...,n-1}.
*
* y  Vector of function values for i = {0,1,...,n-1}.
*
* The length of the y vector (and also the length of a nonempty x vector) must
* be n >= 5. This is because the Akima algorithm requires at least 4
* interpolation subintervals.
*/
function AkimaInterpolation( x, y )
{
   if ( y.length < 5 )
      throw new Error( "AkimaInterpolation(): Less than five data points specified." );
   if ( x.length !== 0 && x.length < y.length )
      throw new Error( "AkimaInterpolation(): Invalid x vector length." );

   this.x = x;
   this.y = y;

   let n = this.y.length;
   let N = n-1; // number of subintervals

   this.b = new Float32Array( N );
   this.c = new Float32Array( N );
   this.d = new Float32Array( N );

   // Chordal slopes. We need room for 4 additional prescribed slopes.
   let m = new Float32Array( N+4 ); //

   // Akima left-hand slopes to support corners.
   let tL = new Float32Array( n );

   // Calculate chordal slopes for each subinterval.
   if ( this.x.length > 0 )
      for ( let i = 0; i < N; ++i )
      {
         let h = this.x[i+1] - this.x[i];
         if ( 1 + h*h === 1 )
            throw new Error( "AkimaInterpolation(): Empty interpolation subinterval(s)." );
         m[i+2] = (this.y[i+1] - this.y[i])/h;
      }
   else
      for ( let i = 0; i < N; ++i )
         m[i+2] = this.y[i+1] - this.y[i];

   // Prescribed slopes at ending locations.
   m[  0] = 3*m[  2] - 2*m[3];
   m[  1] = 2*m[  2] -   m[3];
   m[N+2] = 2*m[N+1] -   m[N];
   m[N+3] = 3*m[N+1] - 2*m[N];

   /*
    * Akima left-hand and right-hand slopes.
    * Right-hand slopes are just the interpolation coefficients b[i].
    */
   for ( let i = 0; i < n; ++i )
   {
      let f = Math.abs( m[i+1] - m[i  ] );
      let e = Math.abs( m[i+3] - m[i+2] ) + f;
      if ( 1 + e !== 1 )
      {
         tL[i] = m[i+1] + f*(m[i+2] - m[i+1])/e;
         if ( i < N )
            this.b[i] = tL[i];
      }
      else
      {
         tL[i] = m[i+1];
         if ( i < N )
            this.b[i] = m[i+2];
      }
   }

   /*
    * Interpolation coefficients b[i], c[i], d[i].
    * a[i] coefficients are the y[i] ordinate values.
    */
   for ( let i = 0; i < N; ++i )
   {
      this.c[i] = 3*m[i+2] - 2*this.b[i] - tL[i+1];
      this.d[i] = this.b[i] + tL[i+1] - 2*m[i+2];
      if ( this.x.length > 0 )
      {
         let h = this.x[i+1] - this.x[i];
         this.c[i] /= h;
         this.d[i] /= h*h;
      }
   }

   this.evaluate = function( x )
   {
      /*
       * Find the subinterval i0 such that this.x[i0] <= x < this.x[i0+1].
       * Find the distance dx = x - this.x[i], or dx = x - i for implicit
       * x = {0,1,...n-1}.
       */
      let i0;
      let dx;
      if ( this.x.length > 0 )
      {
         i0 = 0;
         let i1 = this.x.length - 1;
         while ( i1-i0 > 1 )
         {
            let im = (i0 + i1) >> 1;
            if ( x < this.x[im] )
               i1 = im;
            else
               i0 = im;
         }
         dx = x - this.x[i0];
      }
      else
      {
         if ( x <= 0 )
            return this.y[0];
         if ( x >= this.y.length-1 )
            return this.y[this.y.length-1];
         i0 = Math.trunc( x );
         dx = x - i0;
      }

      /*
       * Use a Horner scheme to calculate b[i]*dx + c[i]*dx^2 + d[i]*dx^3.
       */
      return this.y[i0] + dx*(this.b[i0] + dx*(this.c[i0] + dx*this.d[i0]));
   };
}
