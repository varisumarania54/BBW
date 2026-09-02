exports.pointsHistoryHelper = {
    /**
     * Gets points type for Bonus Points
     * @param {string} type - string of points type
     * @returns {string} - Points earned concatenated with Point(s)
     */
    isBonusPoints: function(type) {
        return ['BONUS', 'ACCELERATOR'].includes(type);
    },
    /**
     * Get title based on data
     * @param {string} pointDescription - description of point
     * @param {string} transactionChannel - transaction channel
     * @param {string} pointType - point type
     * @returns {string} - Publicly facing title
     */
    getTitle: function(pointDescription, transactionChannel, pointType) {
        const pointOfSale = transactionChannel.toLowerCase();
        if (pointDescription === 'Points to Reward(s) Conversion') return '1 Reward Earned';
        if (pointDescription === 'Manual adjustment') return 'Adjustment';
        if (pointDescription === 'CustomerAppeasement') return 'Adjustment';
        if (pointDescription === 'Purchase') {
            if (pointOfSale === 'web') return 'Online Purchase';
            if (pointOfSale === 'store') return 'In-Store Purchase';
            if (pointOfSale === '') return 'Purchase';
        }
        if (pointDescription === 'Return') return 'Return';
        if (pointDescription === 'Points Expired') return 'Points Expired';
        if (pointDescription === 'Progressive Enrollment' && pointOfSale === 'web') return 'Online Purchase';
        if (pointDescription === 'Progressive Enrollment' && pointOfSale === 'instore') return 'In-Store Purchase';
        if (pointType === 'BONUS' || pointType === 'ACCELERATOR') return pointDescription;
        return 'Adjustment';
    },
    /**
     * Model for points history
     * @param {string} pointsHistory - raw data from points history service
     * @param {string} pagenum - current page number 
     * @returns {object} model of json data for response
     */
    pointsHistoryModel: function (pointsHistory, pagenum, maxRecordsPerPage) {
        const maxPagination = Math.ceil(pointsHistory.totalRecords / maxRecordsPerPage);
        const totalRecords = pointsHistory.totalRecords;
        const currentPage = pagenum >= 1 ? parseInt(pagenum) : 1;
        const balance = pointsHistory.data.length > 0 && pointsHistory.data[0].balanceAfter;
        const pointsTotal = currentPage === 1 ? balance : null;
       
        let itemData = pointsHistory.data.map(point => {
            return {
                bonusPoints: this.isBonusPoints(point.pointType),
                dateUTC: point.issuancePostDateTime ? point.issuancePostDateTime : null,
                title: this.getTitle(point.transactionDescription, point.transactionChannel, point.pointType),
                transaction: point.transactionType ? point.transactionType.toLowerCase() : null,
                type: point.pointType ? point.pointType.toLowerCase() : null,
                orderNumber: point.transactionNumber ? `00${point.transactionNumber}` : null,
                value: point.pointsEarned ? point.pointsEarned : null
            };
        });

        return {
            pointsTotal,
            maxPagination,
            totalRecords,
            currentPage,
            itemData
        };
    }
}